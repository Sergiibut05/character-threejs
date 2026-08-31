/**
 * Shared leaderboard body: the Top 10 list (with medals + optional highlighted
 * row) plus a "your position" pill when you're outside the Top 10. Used by both
 * the post-game results flow (FrisbeeSession) and the in-world ranking sign.
 */
import { t } from '../../Utils/gameText.js'
export function buildLeaderboardList(top10, myBest, highlightEntry = null) {
    const wrap = document.createElement('div')
    wrap.className = 'fz-lb-wrap'

    const list = document.createElement('div')
    list.className = 'fz-lb'

    if (!top10.length) {
        const empty = document.createElement('div')
        empty.className = 'fz-lb-empty'
        empty.textContent = t('leaderboard.empty')
        list.appendChild(empty)
    } else {
        top10.forEach((e, i) => {
            const rank = i + 1
            const row = document.createElement('div')
            row.className = 'fz-lb-row'
            if (highlightEntry && e === highlightEntry) row.classList.add('is-me')
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
            row.innerHTML = `
                <span class="fz-lb-rank">${medal}</span>
                <span class="fz-lb-name">${e.name}</span>
                <span class="fz-lb-score">${e.score}</span>`
            list.appendChild(row)
        })
    }
    wrap.appendChild(list)

    if (myBest?.rank && myBest.rank > 10) {
        const me = document.createElement('div')
        me.className = 'fz-lb-me-out'
        me.textContent = t('leaderboard.yourPosition', { rank: myBest.rank, score: myBest.score })
        wrap.appendChild(me)
    }

    return wrap
}
