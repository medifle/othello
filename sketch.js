'use strict'

let board, reachableSpots, lastPlay

/**
 * For player
 */
let counts // array
let curPlayerIndex // 0 for Black, 1 for White
const players = ['B', 'W']
// let human = [true, true]
const human = [false, false]
const ai = ['alphabeta', 'mtdf_id'] // 'random', 'alphabeta', 'mtdf', 'mtdf_id', 'mcts'
const aiDepth = [6, 6]

let interval = 1
let nodeCount = 0

/**
 * For drawing
 */
let squareWidth, squareHeight
let history, scoreBoard

/**
 * For transposition table
 */
const zobristTable = make3DrandomArray(8, 8, 2)
const transpositionTable = new Map()

function make3DrandomArray(x, y, z) {
  // 2 ** 53 - 1 is javascript limit, through 2 ** 64 is more desirable(require external lib)
  const bound = Number.MAX_SAFE_INTEGER + 1
  return Array(x)
    .fill(0)
    .map((e) =>
      Array(y)
        .fill(0)
        .map((e) =>
          Array(z)
            .fill(0)
            .map((e) => Math.floor(Math.random() * bound))
        )
    )
}

// Zobrist Hashing
function getBoardHash() {
  let h = 0
  for (let i = 0; i < 8; ++i) {
    for (let j = 0; j < 8; ++j) {
      let player = board[i][j]
      if (players.includes(player)) {
        let p = players.indexOf(player)
        h ^= zobristTable[i][j][p]
      }
    }
  }
  return h
}

function start() {
  // default config
  board = [
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', 'A', 'A', 'A', 'A', '', ''],
    ['', '', 'A', 'W', 'B', 'A', '', ''],
    ['', '', 'A', 'B', 'W', 'A', '', ''],
    ['', '', 'A', 'A', 'A', 'A', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
  ]
  counts = [2, 2]
  lastPlay = [-1, -1]
  reachableSpots = []
  curPlayerIndex = 0
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      if (board[i][j] === 'A') {
        reachableSpots.push([i, j])
      }
    }
  }
  history.html('')
  updateScoreBoard()

  if (!human[curPlayerIndex]) {
    setTimeout(nextTurn.bind(null, ai[curPlayerIndex]), interval)
  }
}

function addFinalResult(result) {
  scoreBoard.elt.innerHTML += `<br/>${result}`
}

function addList(text) {
  let div = createDiv(`${players[curPlayerIndex]}:${text}`)
  history.child(div)
  history.elt.scrollTop = history.elt.scrollHeight // keep showing the latest item
}

function updateScoreBoard() {
  scoreBoard.html(
    `Black: ${counts[0]} &nbsp;&nbsp;&nbsp;-&nbsp;&nbsp;&nbsp; White: ${counts[1]}`
  )
}

function coreMove(i, j, playerIndex) {
  // place disc
  board[i][j] = players[playerIndex]
  counts[playerIndex]++

  updateReachableSpots(i, j, playerIndex)

  let curPlayer = players[playerIndex]
  let otherPlayer = players[playerIndex ^ 1]

  // search radially
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (di || dj) {
        // 8 directions
        let k = 1 // distance factor
        while (getPlayer(i + di * k, j + dj * k) === otherPlayer) {
          k++
        }
        if (k > 1 && getPlayer(i + di * k, j + dj * k) === curPlayer) {
          // flip all the opponents in between
          while (k > 1) {
            k--
            flipDisc(i + di * k, j + dj * k, playerIndex)
          }
        }
      }
    }
  }
}

function move(i, j) {
  coreMove(i, j, curPlayerIndex)
  lastPlay[0] = i
  lastPlay[1] = j
  updateScoreBoard()
  addList(`(${i + 1},${j + 1})`)
}

function isInBoard(i, j) {
  return i >= 0 && i < 8 && j >= 0 && j < 8
}

function getPlayer(i, j) {
  if (isInBoard(i, j)) {
    return board[i][j]
  }
}

function updateReachableSpots(i, j, playerIndex) {
  for (let dj = -1; dj <= 1; dj++) {
    let j2 = j + dj
    for (let di = -1; di <= 1; di++) {
      if (di || dj) {
        let i2 = i + di
        if (getPlayer(i2, j2) === '') {
          reachableSpots.push([i2, j2])
          board[i2][j2] = 'A'
        }
      }
    }
  }
}

function flipDisc(i, j, playerIndex) {
  board[i][j] = players[playerIndex]
  counts[playerIndex] += 1
  counts[playerIndex ^ 1] -= 1
}

function isAvailablePlayer(i, j, playerIndex) {
  let otherPlayer = players[playerIndex ^ 1]
  const curPlayer = players[playerIndex]

  // search radially
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      // 8 directions
      if (di || dj) {
        let k = 1 // distance factor
        while (getPlayer(i + di * k, j + dj * k) === otherPlayer) {
          k++
        }
        if (k > 1 && getPlayer(i + di * k, j + dj * k) === curPlayer) {
          return true
        }
      }
    }
  }
  return false
}

function hasAvailablePlayer(playerIndex) {
  for (let spot of reachableSpots) {
    if (isAvailablePlayer(spot[0], spot[1], playerIndex)) {
      return true
    }
  }
  return false
}

function checkWinner() {
  if (isGameOver()) {
    if (counts[0] > counts[1]) {
      return 'Black wins'
    } else if (counts[1] > counts[0]) {
      return 'White wins'
    } else {
      return 'Tie!'
    }
  }
}

function randomAI() {
  let index, spot
  do {
    index = floor(random(reachableSpots.length))
    spot = reachableSpots[index]
  } while (!isAvailablePlayer(spot[0], spot[1], curPlayerIndex))
  return index
}

// [START heuristic evaluation]
function corners(playerIndex) {
  let stable = []
  const curPlayer = players[playerIndex]

  // top-left corner
  let m = 7
  for (let j = 0; j < 7; j++) {
    for (let i = 0; i < m; i++) {
      if (board[i][j] !== curPlayer) {
        m = i
        break
      } else {
        stable[i * 8 + j] = true
      }
    }
    if (m === 0) {
      break
    }
  }

  // bottom-left corner
  m = 7
  for (let j = 7; j > 0; j--) {
    for (let i = 0; i < m; i++) {
      if (board[i][j] !== curPlayer) {
        m = i
        break
      } else {
        stable[i * 8 + j] = true
      }
    }
    if (m === 0) {
      break
    }
  }

  // top-right corner
  m = 0
  for (let j = 0; j < 7; j--) {
    for (let i = 7; i > m; i--) {
      if (board[i][j] !== curPlayer) {
        m = i
        break
      } else {
        stable[i * 8 + j] = true
      }
    }
    if (m === 7) {
      break
    }
  }

  // bottom-right corner
  m = 0
  for (let j = 7; j > 0; j--) {
    for (let i = 7; i > m; i--) {
      if (board[i][j] !== curPlayer) {
        m = i
        break
      } else {
        stable[i * 8 + j] = true
      }
    }
    if (m === 7) {
      break
    }
  }

  return stable.filter((s) => s).length
}

function countAvailablePlayer(playerIndex) {
  let count = 0
  for (let spot of reachableSpots) {
    if (isAvailablePlayer(spot[0], spot[1], playerIndex)) {
      count += 1
    }
  }
  return count
}

function evaluate(isEnd = false) {
  const otherPlayerIndex = curPlayerIndex ^ 1
  if (isEnd) {
    if (counts[curPlayerIndex] > counts[otherPlayerIndex]) {
      return 1000000 + counts[curPlayerIndex]
    } else if (counts[otherPlayerIndex] > counts[curPlayerIndex]) {
      return -1000000 - counts[otherPlayerIndex]
    } else {
      return 0
    }
  }

  return (
    (corners(curPlayerIndex) - corners(otherPlayerIndex)) * 10000 +
    (countAvailablePlayer(curPlayerIndex) -
      countAvailablePlayer(otherPlayerIndex)) *
      100 +
    (counts[curPlayerIndex] - counts[otherPlayerIndex])
  )
}
// [END heuristic evaluation]

function isGameOver() {
  return !hasAvailablePlayer(0) && !hasAvailablePlayer(1)
}

/**
 *
 * @param playerIndex
 * @returns {[]} [spot[0], spot[1], spotIndex]
 */
function expand(playerIndex) {
  const children = []
  for (let spotIndex = 0; spotIndex < reachableSpots.length; spotIndex++) {
    let spot = reachableSpots[spotIndex]
    if (isAvailablePlayer(spot[0], spot[1], playerIndex)) {
      children.push(spot.concat(spotIndex))
    }
  }
  return children
}

// AlphaBetaWithMemory
// https://people.csail.mit.edu/plaat/mtdf.html#abmem
// https://github.com/jennydvr/Othello/blob/master/alphabetapr.cpp
function alphabetaMemo(playerIndex, depth, alpha, beta, isRoot = false) {
  // [START check transposition table]
  const hash = getBoardHash()
  const store = transpositionTable.get(hash)
  if (store && store.depth >= depth) {
    const {lowerbound, upperbound} = store
    if (lowerbound) {
      if (lowerbound >= beta) {
        if (isRoot) {
          return {index: store.index, bestScore: lowerbound}
        }
        return lowerbound
      }
      alpha = max(alpha, lowerbound)
    }
    if (upperbound) {
      if (upperbound <= alpha) {
        if (isRoot) {
          return {index: store.index, bestScore: upperbound}
        }
        return upperbound
      }
      beta = min(beta, upperbound)
    }
  }
  // [END check transposition table]

  if (isGameOver()) {
    evaluate(true)
  }
  if (depth === 0) {
    return evaluate()
  }
  // generate children
  let children = expand(playerIndex)
  // if children is empty, return evaluated score
  if (children.length === 0) {
    return evaluate()
  }

  const saveReachableSpots = [...reachableSpots]
  const saveBoard = board.map((e) => e.slice(0)) // clone 2d array with primitive value
  const saveCounts = [...counts]

  let index = -1
  let bestScore, a, b
  // Max node
  if (playerIndex === curPlayerIndex) {
    bestScore = -Infinity
    a = alpha /* save original alpha value */
    for (let child of children) {
      nodeCount += 1
      let spotIndex = child[2]
      // modify
      reachableSpots.splice(spotIndex, 1)
      coreMove(child[0], child[1], playerIndex)
      let score = alphabetaMemo(playerIndex ^ 1, depth - 1, a, beta)

      // note that if all children return the same score, the order of reachableSpots matters
      // that's why we shuffle reachableSpots in nextTurn()
      if (score > bestScore) {
        bestScore = score
        index = spotIndex
      }
      // restore
      reachableSpots = [...saveReachableSpots]
      board = saveBoard.map((e) => e.slice(0)) // deep restore
      counts = [...saveCounts]

      a = max(a, score)
      // cut-off
      if (a >= beta) {
        break
      }
    }
  }
  // Min node
  else {
    bestScore = Infinity
    b = beta /* save original beta value */
    for (let child of children) {
      nodeCount += 1
      let spotIndex = child[2]
      // modify
      reachableSpots.splice(spotIndex, 1)
      coreMove(child[0], child[1], playerIndex)
      let score = alphabetaMemo(playerIndex ^ 1, depth - 1, alpha, b)
      if (score < bestScore) {
        bestScore = score
        index = spotIndex
      }
      // restore
      reachableSpots = [...saveReachableSpots]
      board = saveBoard.map((e) => e.slice(0)) // deep restore
      counts = [...saveCounts]

      b = min(b, score)
      // cut-off
      if (alpha >= b) {
        break
      }
    }
  }

  // [START check table]
  /* Fail low result implies an upper bound */
  if (bestScore <= alpha) {
    transpositionTable.set(hash, {
      depth: depth,
      upperbound: bestScore,
      index,
    })
  }
  /* Found an accurate minimax value - will not occur if called with zero window */
  if (bestScore > alpha && bestScore < beta) {
    transpositionTable.set(hash, {
      depth: depth,
      upperbound: bestScore,
      lowerbound: bestScore,
      index,
    })
  }
  /* Fail high result implies a lower bound */
  if (bestScore >= beta) {
    transpositionTable.set(hash, {
      depth: depth,
      lowerbound: bestScore,
      index,
    })
  }
  // [END check table]

  if (!isRoot) {
    return bestScore
  }

  return {index, bestScore}
}

/**
 * https://people.csail.mit.edu/plaat/mtdf.html
 * https://en.wikipedia.org/wiki/MTD-f
 *
 * @param f first guess for best value
 * @param depth
 */
function MTDF(f, depth) {
  nodeCount = 0

  let beta, index
  let g = f
  let upperBound = Infinity
  let lowerBound = -Infinity

  while (lowerBound < upperBound) {
    beta = max(g, lowerBound + 1)
    ;({bestScore: g, index} = alphabetaMemo(
      curPlayerIndex,
      depth,
      beta - 1,
      beta,
      true
    ))
    if (g < beta) {
      upperBound = g
    } else {
      lowerBound = g
    }
    // console.log(`MTDF: g ${g}, beta ${beta}, (${lowerBound},${upperBound})`) //test
  }
  console.log(`MTDF: nodeCount ${nodeCount}`)
  return {g, index}
}

/**
 * MTDF with Iterative Deepening
 * https://people.csail.mit.edu/plaat/mtdf.html
 *
 * @param depth max search depth
 */
function MTDF_ID(depth) {
  let firstGuess = 0
  let index
  console.log('MTDF_ID: start')
  for (let d = 1; d <= depth; ++d) {
    // console.log(`MTDF_ID: search depth ${d}`) // test
    ;({g: firstGuess, index} = MTDF(firstGuess, d))
    // console.log(`MTDF_ID: firstGuess ${firstGuess}`) //test
  }
  console.log('MTDF_ID: finished')
  return index
}

function alphabetaAI(playerIndex, depth, alpha, beta, isRoot = false) {
  if (isRoot) nodeCount = 0

  if (isGameOver()) {
    evaluate(true)
  }
  if (depth === 0) {
    return evaluate()
  }
  // generate children
  let children = expand(playerIndex)
  // if children is empty, return evaluated score
  if (children.length === 0) {
    return evaluate()
  }

  const saveReachableSpots = [...reachableSpots]
  const saveBoard = board.map((e) => e.slice(0)) // clone 2d array with primitive value
  const saveCounts = [...counts]

  let index = -1
  let bestScore
  // Max node
  if (playerIndex === curPlayerIndex) {
    bestScore = -Infinity
    for (let child of children) {
      nodeCount += 1
      let spotIndex = child[2]
      // modify
      reachableSpots.splice(spotIndex, 1)
      coreMove(child[0], child[1], playerIndex)
      let score = alphabetaAI(playerIndex ^ 1, depth - 1, alpha, beta)

      // note that if all children return the same score, the order of reachableSpots matters
      // that's why we shuffle reachableSpots in nextTurn()
      if (score > bestScore) {
        bestScore = score
        index = spotIndex
      }
      // restore
      reachableSpots = [...saveReachableSpots]
      board = saveBoard.map((e) => e.slice(0)) // deep restore
      counts = [...saveCounts]

      alpha = max(alpha, score)
      // cut-off
      if (alpha >= beta) {
        break
      }
    }
  }
  // Min node
  else {
    bestScore = Infinity
    for (let child of children) {
      nodeCount += 1
      let spotIndex = child[2]
      // modify
      reachableSpots.splice(spotIndex, 1)
      coreMove(child[0], child[1], playerIndex)
      let score = alphabetaAI(playerIndex ^ 1, depth - 1, alpha, beta)
      if (score < bestScore) {
        bestScore = score
        index = spotIndex
      }
      // restore
      reachableSpots = [...saveReachableSpots]
      board = saveBoard.map((e) => e.slice(0)) // deep restore
      counts = [...saveCounts]

      beta = min(beta, score)
      // cut-off
      if (alpha >= beta) {
        break
      }
    }
  }
  if (!isRoot) {
    return bestScore
  }

  console.log('alphabetaAI: nodeCount', nodeCount)
  return {index, bestScore}
}

function nextTurn(algo = 'random') {
  let notAvailable = false
  if (hasAvailablePlayer(curPlayerIndex)) {
    if (human[curPlayerIndex]) {
      return
    }
    let index
    switch (algo) {
      case 'random':
        index = randomAI()
        break
      case 'alphabeta':
        // shuffle(reachableSpots, true)
        ;({index} = alphabetaAI(
          curPlayerIndex,
          aiDepth[curPlayerIndex],
          -Infinity,
          Infinity,
          true
        ))
        break
      case 'mtdf':
        // shuffle(reachableSpots, true)
        ;({index} = MTDF(0, aiDepth[curPlayerIndex]))
        break
      case 'mtdf_id':
        // shuffle(reachableSpots, true)
        index = MTDF_ID(aiDepth[curPlayerIndex])
        break
    }
    let spot = reachableSpots.splice(index, 1)[0]
    move(spot[0], spot[1])
  } else {
    notAvailable = true
  }

  let result = checkWinner()
  if (result) {
    addFinalResult(result)
  } else {
    if (notAvailable) {
      addList('pass')
    }
    // change player
    curPlayerIndex = curPlayerIndex ^ 1
    setTimeout(nextTurn.bind(null, ai[curPlayerIndex]), interval)
  }
}

/**
 * For debug: fast move
 * start from black, index start from 1
 * @param moveArr e.g. [[5,6],[6,4]]
 */
function loadState(moveArr) {
  for (let _move of moveArr) {
    let index = reachableSpots.findIndex(
      (e) => e[0] === _move[0] - 1 && e[1] === _move[1] - 1
    )
    reachableSpots.splice(index, 1)[0]
    move(_move[0] - 1, _move[1] - 1)
    curPlayerIndex = curPlayerIndex ^ 1
  }
}

function mousePressed() {
  if (human[curPlayerIndex]) {
    let i = floor((mouseX - squareWidth / 2) / squareWidth)
    let j = floor((mouseY - squareHeight / 2) / squareHeight)
    if (isInBoard(i, j)) {
      let index = reachableSpots.findIndex(
        (spot) => spot[0] === i && spot[1] === j
      )
      if (index >= 0) {
        if (isAvailablePlayer(i, j, curPlayerIndex)) {
          reachableSpots.splice(index, 1) // remove it from reachableSpots
          move(i, j)
          curPlayerIndex = curPlayerIndex ^ 1
          setTimeout(nextTurn.bind(null, ai[curPlayerIndex]), interval)
        }
      }
    }
  }
}

function setup() {
  createCanvas(432, 432)

  frameRate(30)
  squareWidth = width / 9
  squareHeight = height / 9

  // history style
  history = createDiv()
  history.position(460, squareHeight / 2)
  history.size(110, 480)
  history.style('border', 'black 1px solid')
  history.style('padding', '4px')
  history.style('box-sizing', 'border-box')
  history.style('font-family', 'monospace')
  history.style('font-size', '20px')
  history.style('overflow-y', 'scroll')

  // scoreBoard style
  scoreBoard = createDiv()
  scoreBoard.style('font-size', '32px')
  scoreBoard.style('font-weight', '300')
  scoreBoard.style('text-align', 'center')
  scoreBoard.style('width', `${width}px`)
  scoreBoard.position(0, height)

  start()
}

// [START hint config]
let hint = true
let fadeLowerBound = 15
let fadeUpperBound = 100
let fade = fadeLowerBound
let fadeSpeed = 0.45
// [END hint config]

function draw() {
  background(244, 248, 252)

  rectMode(CORNER)
  noStroke()
  fill(0)
  textSize(squareHeight * 0.4)
  textAlign(CENTER, CENTER)
  for (let i = 0; i < 8; i++) {
    text(i + 1, squareWidth / 4, squareHeight * i + squareHeight)
    text(i + 1, squareWidth * i + squareWidth, squareHeight / 4)
  }

  rectMode(CENTER)
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      let x = squareWidth * i + squareWidth
      let y = squareHeight * j + squareHeight
      let spot = board[i][j]
      strokeWeight(2)
      stroke(0)
      if (spot === '') {
        fill(0, 102, 50)
      } else {
        fill(0, 153, 76)
      }
      rect(x, y, squareWidth, squareHeight)
      if (spot === players[0]) {
        noStroke()
        fill(0)
        ellipse(x, y, squareWidth * 0.75)
      } else if (spot === players[1]) {
        noStroke()
        fill(255)
        ellipse(x, y, squareWidth * 0.75)
      } else if (
        human[curPlayerIndex] &&
        isAvailablePlayer(i, j, curPlayerIndex)
      ) {
        if (hint) {
          stroke(102, 102, 102, fade)
          if (fade < fadeLowerBound || fade > fadeUpperBound) {
            fadeSpeed *= -1
          }
          fade += fadeSpeed

          ellipse(x, y, squareWidth * 0.5)
          noFill()
          ellipse(x, y, squareWidth * 0.7)
        }
      }

      if (i === lastPlay[0] && j === lastPlay[1]) {
        strokeWeight(1.5)
        stroke(244, 67, 54, 210)
        noFill()
        ellipse(x, y, squareWidth * 0.75)
      }
    }
  }
}
