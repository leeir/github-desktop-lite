import { Repository } from '../models/repository'
import { IBulkPullOutcome, IBulkPullState } from '../models/bulk-pull'

/** Pull each saved repository once, retaining failures alongside successes. */
export async function runBulkPull(
  repositories: ReadonlyArray<Repository>,
  pullRepository: (repository: Repository) => Promise<IBulkPullOutcome>,
  onUpdate: (state: IBulkPullState) => void
): Promise<void> {
  const unique = [...new Map(repositories.map(r => [r.path, r])).values()]
  const results: IBulkPullState['results'][number][] = []
  const publish = (currentRepository: Repository | null, running = true) =>
    onUpdate({
      running,
      total: unique.length,
      currentRepository,
      results: [...results],
    })

  for (const repository of unique) {
    publish(repository)
    try {
      results.push({ repository, ...(await pullRepository(repository)) })
    } catch (error) {
      results.push({
        repository,
        status: 'failed',
        branch: null,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  publish(null, false)
}
