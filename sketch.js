'use strict'

let board, reachableSpots, lastPlay, hash

/**
 * For player
 */
let counts // array
let curPlayerIndex // current player index: 0 for Black, 1 for White
const players = ['B', 'W']
let human = [true, false]
// const human = [false, false]
const ai = ['alphabeta', 'mtdf_id'] // 'random', 'alphabeta', 'mtdf', 'mtdf_id', 'mcs', 'mcts'
const aiDepth = [8, 8] // alphabeta, mtdf, mtdf_id
const simulationRound = [500, 500] // mcs, mcts

let interval = 30 // used with setTimeout to resolve rendering blocking
let nodeCount = 0

let globalAlphabetaCount = 0
let globalMTDfIdCount = 0
let localMTDfIdCount = 0

/**
 * For UI
 */
let squareWidth, squareHeight
let history, scoreBoard

/**
 * For transposition table
 */
const zobristTable = make3DrandomArray(8, 8, 2)
const transpositionTable = new Map()

/**
 *
 * @returns {*[][][]} BigInt type
 */
function make3DrandomArray(x, y, z) {
  // Attention
  // 2 ** 53 - 1 is javascript Number type limit
  // native JavaScript only uses 32 bits bitwise operands even for number larger than 32 bits
  // ES2019 support BigInt but no method for randomly generating BigInt integer
  // Math.random() does not support BigInt
  // Solution: use BigInteger.js library to randomly generate a native BigInt (supported by modern browsers)
  const bound = 2 ** 64
  return Array(x)
    .fill(0)
    .map((e) =>
      Array(y)
        .fill(0)
        .map((e) =>
          Array(z)
            .fill(0)
            .map((e) => bigInt.randBetween(0, bound).value)
        )
    )
}

// Zobrist Hashing
function computeBoardHash() {
  let h = 0n  // BigInt type
  for (let i = 0; i < 8; ++i) {
    for (let j = 0; j < 8; ++j) {
      let player = board[i][j]
      let playerIndex = players.indexOf(player)
      if (playerIndex !== -1) {
        h ^= zobristTable[i][j][playerIndex]  // BigInt type support XOR, no longer 32 bits limit
      }
    }
  }
  return h
}

function updateBoardHash(i, j, playerIndex) {
  let prevPlayer = board[i][j]
  let prevPlayerIndex = players.indexOf(prevPlayer)
  if (prevPlayerIndex !== -1) {
    hash ^= zobristTable[i][j][prevPlayerIndex]
  }
  hash ^= zobristTable[i][j][playerIndex]
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

  // init reachableSpots
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

function coreMove(i, j, playerIndex) {
  if (hash) {
    updateBoardHash(i, j, playerIndex)
  }
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
  if (hash) {
    updateBoardHash(i, j, playerIndex)
  }
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
      return 'B'
    } else if (counts[1] > counts[0]) {
      return 'W'
    } else {
      return 'T' // tie
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
// Credits: Copper France
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
 * Generate children nodes (virtual)
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
// https://www.gamedev.net/forums/topic.asp?topic_id=503234
function alphabetaMemo(playerIndex, depth, alpha, beta, isRoot = false) {
  // [START check transposition table]
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
    return evaluate(true)
  }
  if (depth === 0) {
    return evaluate()
  }
  // generate children
  let children = expand(playerIndex)
  // if children is empty, return evaluated score
  // this is possible even we have isGameOver() check above:
  // when this player has no children but the opponent has at least one child
  if (children.length === 0) {
    return evaluate()
  }

  const saveReachableSpots = [...reachableSpots]
  const saveBoard = board.map((e) => e.slice(0)) // clone 2d array with primitive value
  const saveCounts = [...counts]
  const saveHash = hash

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
      hash = saveHash

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
      hash = saveHash

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

  hash = computeBoardHash()

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
  localMTDfIdCount += nodeCount
  return {g, index}
}

/**
 * MTDF with Iterative Deepening
 * https://people.csail.mit.edu/plaat/mtdf.html
 *
 * @param depth max search depth
 */
function MTDF_ID(depth) {
  localMTDfIdCount = 0
  let evenFirstGuess = 0
  let oddFirstGuess = 0
  let index
  let isEvenPly = false
  for (let d = 1; d <= depth; ++d) {
    if (isEvenPly) {
      ;({g: evenFirstGuess, index} = MTDF(evenFirstGuess, d))
    } else {
      ;({g: oddFirstGuess, index} = MTDF(oddFirstGuess, d))
    }
    isEvenPly = !isEvenPly
  }
  console.log('MTDF_ID: nodeCount', localMTDfIdCount)
  globalMTDfIdCount += localMTDfIdCount
  return index
}

function alphabetaAI(playerIndex, depth, alpha, beta, isRoot = false) {
  if (isRoot) nodeCount = 0

  if (isGameOver()) {
    return evaluate(true)
  }
  if (depth === 0) {
    return evaluate()
  }
  // generate children
  let children = expand(playerIndex)
  // if children is empty, return evaluated score
  // this is possible even we have isGameOver() check above:
  // when this player has no children but the opponent has at least one child
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
  globalAlphabetaCount += nodeCount
  return {index, bestScore}
}

/**
 * Monte-Carlo search simulation
 */
function MCS_simulate(n, playerIndex) {
  // save game state
  const saveReachableSpots = [...reachableSpots]
  const saveBoard = board.map((e) => e.slice(0)) // clone 2d array with primitive value
  const saveCounts = [...counts]

  let pIndex = playerIndex
  let count = 0
  for (let i = 0; i < n; ++i) {
    while (!isGameOver()) {
      let children = expand(pIndex)
      if (children.length > 0) {
        let chosenChild = random(children)
        let spotIndex = chosenChild[2]
        // make move
        reachableSpots.splice(spotIndex, 1)
        coreMove(chosenChild[0], chosenChild[1], pIndex)
      }
      pIndex = pIndex ^ 1
    }
    if (checkWinner() === players[curPlayerIndex]) {
      count += 1
    }
    // restore
    reachableSpots = [...saveReachableSpots]
    board = saveBoard.map((e) => e.slice(0)) // deep restore
    counts = [...saveCounts]
  }
  return count / n
}

/**
 * pure Monte-Carlo search
 *
 * @param n simulation rounds
 */
function MCS(n) {
  let playerIndex = curPlayerIndex
  let bestScore = -Infinity
  let index = -1 // the index associated with bestScore

  // save game state
  const saveReachableSpots = [...reachableSpots]
  const saveBoard = board.map((e) => e.slice(0)) // clone 2d array with primitive value
  const saveCounts = [...counts]

  let children = expand(playerIndex)
  for (let child of children) {
    let spotIndex = child[2]
    // modify (make move)
    reachableSpots.splice(spotIndex, 1)
    coreMove(child[0], child[1], playerIndex)

    let score = MCS_simulate(n, playerIndex ^ 1)
    if (score > bestScore) {
      bestScore = score
      index = spotIndex
    }
    // restore
    reachableSpots = [...saveReachableSpots]
    board = saveBoard.map((e) => e.slice(0)) // deep restore
    counts = [...saveCounts]
  }
  console.log(`MCS score ${bestScore}`)//test
  return index
}

function nextTurn(algo = 'random') {
  let notAvailable = false
  if (hasAvailablePlayer(curPlayerIndex)) {
    if (human[curPlayerIndex]) {
      return
    }
    let index

    const start_check = performance.now()//test
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
      case 'mcs':
        shuffle(reachableSpots, true)
        index = MCS(simulationRound[curPlayerIndex])
        break
    }
    const end_check = performance.now()//test
    console.log(`${algo} lapse:`, end_check - start_check)//test

    let spot = reachableSpots.splice(index, 1)[0]
    move(spot[0], spot[1])
  } else {
    notAvailable = true
  }

  let result = checkWinner()
  if (result) {
    addFinalResult(gameResultToText(result))
  } else {
    if (notAvailable) {
      addList('pass')
    }
    // change player
    curPlayerIndex = curPlayerIndex ^ 1
    setTimeout(nextTurn.bind(null, ai[curPlayerIndex]), interval)
  }
}

function gameResultToText(result) {
  let resultText = ''
  switch (result) {
    case 'B':
      resultText = 'Black wins'
      break
    case 'W':
      resultText = 'White wins'
      break
    case 'T':
      resultText = 'Tie!'
  }
  return resultText
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

/**
 * UI
 */
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

  // for coordinate labels
  rectMode(CORNER)
  noStroke()
  fill(0)
  textSize(squareHeight * 0.4)
  textAlign(CENTER, CENTER)
  for (let i = 0; i < 8; i++) {
    text(i + 1, squareWidth / 4, squareHeight * i + squareHeight)
    text(i + 1, squareWidth * i + squareWidth, squareHeight / 4)
  }

  // for game board
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
