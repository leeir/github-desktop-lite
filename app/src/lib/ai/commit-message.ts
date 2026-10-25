import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  buildCommitMessageSystemPrompt,
  buildCommitMessageUserPrompt,
  CommitMessageGenerationCancelledError,
  generateCommitMessagePromptTags,
  getCleanedEnforcedRuleDescriptions,
  ICommitMessageSuggestion,
  parseCommitMessageSuggestion,
} from './commit-prompt'
import { IRepoRulesMetadataRule } from '../../models/repo-rules'
import { aiComplete, cancelAIRequest } from '../../ui/main-process-proxy'
import {
  getAIConnection,
  getAIProviderKey,
  getAIProviderPreset,
  getAITimeoutMs,
  getEffectiveBaseUrl,
  IAISettings,
} from './providers'

/**
 * Maximum number of diff characters sent to the model (roughly 15k tokens).
 * Keeps large changesets from blowing the context window or the bill.
 */
export const MaxPromptDiffLength = 60000

/** Minimum characters kept from each file's patch when truncating. */
const MinPerFilePatchLength = 400

/** Room reserved for the truncation and omission notices. */
const NoticeReserve = 80

/** Repository custom instructions (the file GitHub Copilot reads too). */
const CustomInstructionsPath = join('.github', 'copilot-instructions.md')
const MaxCustomInstructionsLength = 8000

/**
 * Shrinks a `git diff --patch-with-raw` output to at most `maxLength`
 * characters. The raw summary (one line per file) is always kept so the
 * model still sees every changed path; each file's patch then gets an equal
 * share of the remaining budget. Exported for testing.
 */
export function truncateDiffForPrompt(
  diff: string,
  maxLength: number = MaxPromptDiffLength
): string {
  if (diff.length <= maxLength) {
    return diff
  }

  const firstPatch = diff.search(/^diff --git /m)
  const summary = firstPatch === -1 ? '' : diff.slice(0, firstPatch)
  const patches =
    firstPatch === -1
      ? [diff]
      : diff.slice(firstPatch).split(/^(?=diff --git )/m)

  const budget = Math.max(maxLength - summary.length - NoticeReserve, 0)
  const perFile = Math.max(
    Math.floor(budget / patches.length),
    MinPerFilePatchLength
  )

  let result = summary
  let omitted = 0

  for (const patch of patches) {
    const remaining = maxLength - NoticeReserve - result.length

    if (patch.length <= Math.min(perFile, remaining)) {
      result += patch
      continue
    }

    const keep = Math.min(perFile, remaining) - NoticeReserve
    if (keep < MinPerFilePatchLength) {
      omitted++
      continue
    }

    result += `${patch.slice(0, keep)}\n[... truncated ${
      patch.length - keep
    } characters]\n`
  }

  if (omitted > 0) {
    result += `\n[... ${omitted} more file patches omitted; see the summary above]\n`
  }

  return result
}

/**
 * Pulls the JSON object out of a model reply. Many
 * models like to wrap the answer in reasoning (`<think>…</think>`) or prose,
 * which {@link parseCommitMessageSuggestion} would reject. Exported for
 * testing.
 */
export function extractCommitMessageJson(text: string): string {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  if (withoutThinking.startsWith('{') || withoutThinking.includes('```')) {
    return withoutThinking
  }

  const start = withoutThinking.indexOf('{')
  const end = withoutThinking.lastIndexOf('}')
  return start !== -1 && end > start
    ? withoutThinking.slice(start, end + 1)
    : withoutThinking
}

async function readCustomInstructions(
  repositoryPath: string
): Promise<string | null> {
  try {
    const content = await readFile(
      join(repositoryPath, CustomInstructionsPath),
      'utf8'
    )
    const trimmed = content.trim().slice(0, MaxCustomInstructionsLength)
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

/**
 * Generates a commit message by calling the user's model provider directly.
 */
export async function generateCommitMessage(
  settings: IAISettings,
  diff: string,
  repositoryPath: string,
  commitMessageRules: ReadonlyArray<IRepoRulesMetadataRule>,
  signal: AbortSignal
): Promise<ICommitMessageSuggestion> {
  if (signal.aborted) {
    throw new CommitMessageGenerationCancelledError()
  }

  const preset = getAIProviderPreset(settings.providerId)
  if (preset === undefined) {
    throw new Error('The selected AI provider is no longer available.')
  }

  const apiKey = preset.local ? null : await getAIProviderKey(preset.id)
  if (!preset.local && preset.keyUrl !== undefined && !apiKey) {
    throw new Error(
      `No API key is stored for ${preset.name}. Add it in Settings → AI.`
    )
  }

  const tags = generateCommitMessagePromptTags()
  const rules = getCleanedEnforcedRuleDescriptions(commitMessageRules)
  const instructions = await readCustomInstructions(repositoryPath)
  const commitPrompt = buildCommitMessageSystemPrompt(rules.length > 0, tags)
  const systemPrompt =
    instructions === null
      ? commitPrompt
      : `Repository instructions:\n${instructions}\n\n${commitPrompt}`

  const id = crypto.randomUUID()
  const onAbort = () => cancelAIRequest(id)
  signal.addEventListener('abort', onAbort)

  try {
    const result = await aiComplete({
      id,
      connection: getAIConnection(preset, settings.baseUrl, apiKey),
      model: settings.model,
      systemPrompt,
      userPrompt: buildCommitMessageUserPrompt(
        truncateDiffForPrompt(diff),
        tags,
        rules
      ),
      timeoutMs: getAITimeoutMs(
        preset,
        getEffectiveBaseUrl(preset, settings.baseUrl)
      ),
    })

    if (result.kind === 'cancelled' || signal.aborted) {
      throw new CommitMessageGenerationCancelledError()
    }

    if (result.kind === 'error') {
      throw new Error(result.message)
    }

    try {
      return parseCommitMessageSuggestion(extractCommitMessageJson(result.text))
    } catch (e) {
      log.warn(`Unusable commit message reply: ${result.text}`, e)
      throw new Error(
        'The model did not reply with a usable commit message (a JSON object with "title" and "description"). Try again or choose a different model.'
      )
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
