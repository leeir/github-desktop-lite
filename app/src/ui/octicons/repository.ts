import * as octicons from '../octicons/octicons.generated'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'

/**
 * Determine the octicon to display for a given repository.
 */
export function iconForRepository(repository: Repository | CloningRepository) {
  if (repository instanceof CloningRepository) {
    return octicons.desktopDownload
  }

  if (repository.missing) {
    return octicons.alert
  }

  // Visibility is not what tells repositories apart here — a lock on every
  // private repository just repeats the same glyph down the list.
  if (repository.gitHubRepository?.fork) {
    return octicons.repoForked
  }

  return octicons.repo
}
