import { ApplicationError } from '../errors/application-error.mjs';
import { normalizeCaptionAsset, classifyEntry, normalizeLanguage } from './caption-normalizer.mjs';
import { parseSrt } from './srt-parser.mjs';
import { sha256 } from './content-hasher.mjs';

export class MetadataExtractionService {
  constructor({ entryRepository, captionRepository, categoryRepository, testCategoryName, maxSegments=5000 }) { this.entryRepository=entryRepository; this.captionRepository=captionRepository; this.categoryRepository=categoryRepository; this.testCategoryName=testCategoryName; this.maxSegments=maxSegments; this.testCategory=null; }
  // TEST-SCOPE-METHODS
  async getTestCategory() {
    if (this.testCategory) return this.testCategory;

    const category = await this.categoryRepository.findByName(
      this.testCategoryName
    );

    if (!category) {
      throw new ApplicationError(
        "CATEGORY_NOT_FOUND",
        `Category ${this.testCategoryName} not found`,
        404
      );
    }

    this.testCategory = category;
    return category;
  }

  async getTestScope() {
    const category = await this.getTestCategory();

    const entryIds =
      await this.categoryRepository.listEntryIds(
        category.id
      );

    return {
      environment: "PROD_142",
      mode: "READ_ONLY",
      category: {
        id: category.id,
        name: category.name,
        fullName: category.fullName || category.name,
        privacy: category.privacy,
        status: category.status,
        entryCount: entryIds.length
      }
    };
  }

  async assertEntryInTestScope(entryId) {
    const category = await this.getTestCategory();

    const allowed =
      await this.categoryRepository.containsEntry(
        category.id,
        entryId
      );

    if (!allowed) {
      throw new ApplicationError(
        "ENTRY_OUTSIDE_TEST_SCOPE",
        `Entry does not belong to ${this.testCategoryName}`,
        403,
        {
          entryId,
          categoryId: category.id,
          categoryName: category.name
        }
      );
    }

    return category;
  }

  async listTestScopeEntries() {
    const category = await this.getTestCategory();

    const entryIds =
      await this.categoryRepository.listEntryIds(
        category.id
      );

    const entries = [];

    for (const entryId of entryIds) {
      entries.push(
        await this.verifyEntry(
          { entryId },
          { skipScope: true }
        )
      );
    }

    return {
      category: {
        id: category.id,
        name: category.name
      },
      total: entries.length,
      entries
    };
  }

  async verifyEntry(request, options={}) {
    const entryId=String(request.entryId || '').trim();
    if (!entryId) throw new ApplicationError('VALIDATION_ERROR','entryId is required',400);
    if (!options.skipScope) {
      await this.assertEntryInTestScope(entryId);
    }
    let entry;
    try { entry=await this.entryRepository.get(entryId); } catch(error) { if (['ENTRY_ID_NOT_FOUND','INVALID_ENTRY_ID'].includes(error.code)) return this.buildVerify(null, [], request); throw error; }
    const list=await this.captionRepository.list(entryId);
    const transcripts=(list?.objects || []).map(normalizeCaptionAsset);
    return this.buildVerify(entry, transcripts, request);
  }
  buildVerify(entry, transcripts, request) {
    const classification=classifyEntry(Boolean(entry), transcripts, request.requestedLanguages || []);
    return { entryId:request.entryId, entryAvailable:Boolean(entry), title:entry?.name || null, mediaType:Number(entry?.mediaType)===5?'AUDIO':'VIDEO', ...classification, transcripts };
  }
  async extractTranscript(request) {
    if (!request.entryId || !request.captionAssetId) throw new ApplicationError('VALIDATION_ERROR','entryId and captionAssetId are required',400);
    const verification=await this.verifyEntry({ entryId:request.entryId, requestedLanguages:request.languageCode?[request.languageCode]:[] });
    if (!verification.entryAvailable) throw new ApplicationError('ENTRY_NOT_FOUND','Entry not found',404);
    const transcript=verification.transcripts.find(x => x.captionAssetId===request.captionAssetId);
    if (!transcript) throw new ApplicationError('CAPTION_ASSET_NOT_FOUND','Caption asset is not associated with the entry',404);
    if (!transcript.ready) throw new ApplicationError('CAPTION_NOT_READY','Caption is not ready',409,{status:transcript.status},true);
    if (!transcript.eligibleFormat) throw new ApplicationError('INVALID_CAPTION_FORMAT','Caption is not SRT',422,{format:transcript.format});
    const srt=await this.captionRepository.serve(request.captionAssetId);
    const {segments,cleanText}=parseSrt(srt,this.maxSegments);
    const hash=sha256(srt);
    const mode=String(request.outputMode || 'metadata').toLowerCase();
    return {
      entryId:request.entryId, captionAssetId:request.captionAssetId, languageCode:transcript.languageCode, formatCode:1, format:'SRT',
      artifact:{ available:true, fileName:`${request.entryId}_${transcript.languageCode}_${request.captionAssetId}.srt`, contentType:'application/x-subrip', sizeBytes:Buffer.byteLength(srt,'utf8'), sha256:hash, content:['content','full'].includes(mode)?srt:undefined },
      cleanText:{ available:true, textLength:cleanText.length, content:['clean_text','full'].includes(mode)||request.includeCleanText?cleanText:undefined },
      segments:{ available:true, count:segments.length, items:['segments','full'].includes(mode)||request.includeSegments?segments:undefined }
    };
  }
  async extractPreferredTranscript(request) {
    const verification=await this.verifyEntry({ entryId:request.entryId, requestedLanguages:request.languageCode?[request.languageCode]:[] });
    const language=normalizeLanguage(request.languageCode);
    const candidates=verification.transcripts.filter(x => x.eligibleAsset && (language==='und'||x.languageCode===language)).sort((a,b)=>Number(b.isDefault)-Number(a.isDefault)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    if (!candidates.length) throw new ApplicationError('NO_ELIGIBLE_TRANSCRIPT','No eligible READY SRT transcript found',404,{availableLanguages:verification.availableLanguages});
    return this.extractTranscript({...request, captionAssetId:candidates[0].captionAssetId});
  }
}
