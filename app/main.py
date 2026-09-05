from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from gf2_lin_algebra import GF2Matrix
from pathlib import Path
from pydantic import BaseModel
import random


app = FastAPI(title="Hex")
app.mount(
    "/voronoi",
    StaticFiles(directory=Path(__file__).resolve().parent / "voronoi", html=True),
    name="voronoi",
)

# Hash table: user_id -> board
user_boards: dict[str, list] = {}


@app.get("/", response_class = HTMLResponse)
def menu():
    return FileResponse("app/menu.html")

@app.get("/playGame", response_class = HTMLResponse)
def playGame():
    return FileResponse("app/4dim.html")

@app.get("/tutorial", response_class = HTMLResponse)
def tutorial():
    return FileResponse("app/tutorial.html")

class CoordRequest(BaseModel):
    coords: list
    user_id: str

class StartGameRequest(BaseModel):
    size: int
    user_id: str | None = None
    coordOrder: list | None = [0,1,2,3]

class SetRequest(BaseModel):
    user_id: str
    coordOrder: list
    player: int

@app.post("/getEdges")
def getEdges(data: SetRequest):
    board = user_boards.get(data.user_id)
    if board is None:
        return {"error": "No board for this user"}
    if data.player == 1:
        edgeEdges = board.get("posSet").get("edges")
    else:
        edgeEdges = board.get("negSet").get("edges")
    edges = []
    for i in range(len(edgeEdges)):
        if not(isinstance(edgeEdges[i].ends[0].coords[0], str) or isinstance(edgeEdges[i].ends[1].coords[0], str)):
            newEdge = [[0,0,0,0], [0,0,0,0]]
            for j in range(len(data.coordOrder)):
                newEdge[0][j] = edgeEdges[i].ends[0].coords[data.coordOrder[j]]
                newEdge[1][j] = edgeEdges[i].ends[1].coords[data.coordOrder[j]]
            edges.append(newEdge)
    return {"edges": edges}


@app.post("/getTriangles")
def getTriangles(data: SetRequest):
    board = user_boards.get(data.user_id)
    if board is None:
        return {"error": "No board for this user"}
    if data.player == 1:
        triTris = board.get("posSet").get("triangles")
    else:
        triTris = board.get("negSet").get("triangles")
    triangles = []
    edgeEdges = []
    for i in range(len(triTris)):
        if not(isinstance(triTris[i].vertices[0].coords[0], str) or isinstance(triTris[i].vertices[1].coords[0], str)):
            newTri = [[0,0,0,0], [0,0,0,0], [0,0,0,0]]
            if triTris[i].edges[0] not in edgeEdges:
                edgeEdges.append(triTris[i].edges[0])
            if triTris[i].edges[1] not in edgeEdges:
                edgeEdges.append(triTris[i].edges[1])
            if triTris[i].edges[2] not in edgeEdges:
                edgeEdges.append(triTris[i].edges[2])
            for j in range(len(data.coordOrder)):
                newTri[0][j] = triTris[i].vertices[0].coords[data.coordOrder[j]]
                newTri[1][j] = triTris[i].vertices[1].coords[data.coordOrder[j]]
                newTri[2][j] = triTris[i].vertices[2].coords[data.coordOrder[j]]
            triangles.append(newTri)
        newEdge = [[0,0,0,0], [0,0,0,0]]
    edges = []
    for i in range(len(edgeEdges)):
        for j in range(len(data.coordOrder)):
            newEdge[0][j] = edgeEdges[i].ends[0].coords[data.coordOrder[j]]
            newEdge[1][j] = edgeEdges[i].ends[1].coords[data.coordOrder[j]]
        edges.append(newEdge)
    return {"triangles": triangles, "edges": edges}


@app.post("/start2dGame")
def start_2d_game(data: StartGameRequest):
    user_id = data.user_id or str(random.randint(0, 1000000))
    top = Hex([], 1)
    bottom = Hex([], 1)
    left = Hex([], -1)
    right = Hex([], -1)


    posCells = [top, bottom]
    negCells = [left, right]

    boundSet = [top, bottom, left, right]

    board = {"space": create2dBoard(data.size), "player": 1, "posCells": posCells, "negCells": negCells, "posEdges": [], "negEdges": [], "boundSet": boundSet}
    user_boards[user_id] = board
    textBoard = boardTextRep(board.get("space"))
    arrayBoard = boardToArray(board.get("space"))
    return {"user_id": user_id, "textBoard": textBoard, "cells": arrayBoard, "player": board.get("player"), "posCells": board.get("posCells"), "negCells": board.get("negCells"), "posEdges": board.get("posEdges"), "negEdges": board.get("negEdges"), "boundSet": board.get("boundSet")}

@app.get("/getId")
def getId():
    user_id = str(random.randint(0, 1000000))
    return {"user_id": user_id}

class JoinGameRequest(BaseModel):
    user_id: str
    player: int | None = None

@app.post("/joinGame")
def joinGame(data: JoinGameRequest):
    user_id = data.user_id
    board = user_boards.get(user_id)
    isHost = False
    if board is None:
        return {"error": "No board for this user"}
    if board["joined"] == 1 or board["joined"] == -1:
        board["joined"] = -board["joined"]
    else:
        isHost = True
        if data.player is None or data.player == 0:
            board["joined"] = random.choice([1, -1])
        else:
            board["joined"] = data.player
    cells = boardTo4dArray(board.get("space"), [0, 2, 1, 3])
    return {"player": board["joined"], "cells": cells, "isHost": isHost}

@app.post("/start4dGame")
def start_4d_game(data: StartGameRequest):
    user_id = data.user_id or str(random.randint(0, 1000000))
    coordOrder = data.coordOrder or [0, 1, 2, 3]
    board = boardSetUp(data.size)
    user_boards[user_id] = board
    arrayBoard = boardTo4dArray(board.get("space"), coordOrder) 
    return {"user_id": user_id, "cells": arrayBoard, "player": board.get("player"), "gameType": board.get("gameType")}

def boardSetUp(size):
    zeroBounds = [Hex(["z0"], 1), Hex(["z1"], -1), Hex(["z2"], 1), Hex(["z3"], -1)]
    fullBounds = [Hex(["f0"], 1), Hex(["f1"], -1), Hex(["f2"], 1), Hex(["f3"], -1)]
    space = create4dBoard(size)
    posEdges = [Edge(zeroBounds[0], zeroBounds[2]), Edge(zeroBounds[0], fullBounds[2]), Edge(zeroBounds[2], fullBounds[0]), Edge(fullBounds[0], fullBounds[2])]
    negEdges = [Edge(zeroBounds[1], zeroBounds[3]), Edge(zeroBounds[1], fullBounds[3]), Edge(zeroBounds[3], fullBounds[1]), Edge(fullBounds[1], fullBounds[3])]

    for edge in posEdges:
        edge.ends[0].edgeSet.append(edge)
        edge.ends[1].edgeSet.append(edge)
    for edge in negEdges:
        edge.ends[0].edgeSet.append(edge)
        edge.ends[1].edgeSet.append(edge)

    posBoundEdges = posEdges.copy()
    negBoundEdges = negEdges.copy()

    posTriangles = []
    negTriangles = []

    posSet = {"edges": posEdges, "triangles": posTriangles, "boundEdges": posBoundEdges}
    negSet = {"edges": negEdges, "triangles": negTriangles, "boundEdges": negBoundEdges}

    board = {"space": space, "player": 1, "posSet": posSet, "negSet": negSet, "zeroBounds": zeroBounds, "fullBounds": fullBounds, "joined": 0, "victory": 0}
    return board

@app.get("/board/{user_id}")
def get_board(user_id: str):
    board = user_boards.get(user_id)
    if board is None:
        return {"error": "No board for this user"}
    return {"user_id": user_id, "textBoard": boardTextRep(board.get("space"))}

class PlayRequest(BaseModel):
    coords: list
    user_id: str
    coordOrder: list | None = [0, 1, 2, 3]
    botResponse: bool | None = False

class PlayerRequest(BaseModel):
    user_id: str

@app.post("/getPlayer")
def getPlayer(data: PlayerRequest):
    board = user_boards.get(data.user_id)
    if board is None:
        return {"error": "No board for this user"}
    return {"player": board.get("player")}

@app.post("/play2d")
def play2d(data: PlayRequest):
    board = user_boards.get(data.user_id)
    if board is None:
        return {"error": "No board for this user"}
    subBoard = board.get("space")
    for coord in data.coords:
        subBoard = subBoard[coord]
    if board.get("player") == 1:
        edges = board.get("posEdges")
        cells = board.get("posCells")

    else:
        edges = board.get("negEdges")
        cells = board.get("negCells")
    subBoard.changePlayer2d(board.get("player"), board.get("space"), cells, edges, board.get("boundSet"))
    board["player"] = -board.get("player")
    arrayBoard = boardToArray(board.get("space"))
    return {"textBoard": boardTextRep(board.get("space")), "cells": arrayBoard, "victory": findLinear(cells, edges), "player": board.get("player")}

@app.post("/play4d")
def play4d(data: PlayRequest):
    board = user_boards.get(data.user_id)
    if board is None:
        return {"error": "No board for this user"}
    subBoard = board.get("space")

    rearrangedCoords = [0,0,0,0]
    for i in range(len(data.coordOrder)):
        rearrangedCoords[data.coordOrder[i]] = data.coords[i]
    for value in rearrangedCoords:
        subBoard = subBoard[value]
    if board.get("player") == 1:
        set = board.get("posSet")
    else:
        set = board.get("negSet")
    subBoard.changePlayer4d(board.get("player"), board.get("space"), set, board.get("zeroBounds"), board.get("fullBounds"))
    board["player"] = -board.get("player")
    if findSurface(set):
        board["victory"] = -board.get("player") 
    arrayBoard = boardTo4dArray(board.get("space"), data.coordOrder)
      
    return {"cells": arrayBoard, "victory": board.get("victory"), "player": board.get("player"), "coordOrder": data.coordOrder}

class BoardRequest(BaseModel):
    user_id: str
    coordOrder: list | None = [0, 1, 2, 3]

@app.post("/botMove")
def botMove(data: BoardRequest):
    board = user_boards.get(data.user_id)
    if board is None:
        return {"error": "No board for this user"}
    subBoard = board.get("space")
    bestMove = evalMove(board.get("space"))
    for value in bestMove:
        subBoard = subBoard[value]
    if board.get("player") == 1:
        set = board.get("posSet")
    else:
        set = board.get("negSet")
    subBoard.changePlayer4d(board.get("player"), board.get("space"), set, board.get("zeroBounds"), board.get("fullBounds"))
    board["player"] = -board.get("player")
    if findSurface(set):
        board["victory"] = -board.get("player")
    arrayBoard = boardTo4dArray(board.get("space"), data.coordOrder)
    return {"cells": arrayBoard, "victory": board.get("victory"), "player": board.get("player"), "coordOrder": data.coordOrder}

@app.post("/getBoard4d")
def getBoard4d(data: BoardRequest):
    board = user_boards.get(data.user_id)
    if board is None:
        return {"error": "No board for this user"}
    return {"board": boardTo4dArray(board.get("space"), data.coordOrder), "victory": board.get("victory")}

class TutorialRequest(BaseModel):
    user_id: str
    slide: int
    coordOrder: list | None = [0, 1, 2, 3]

@app.post("/readTutorial")
def readTutorial(data: TutorialRequest):
    size = 3
    is2d = False
    manCoords = False
    btriangleShow = False
    rtriangleShow = False
    coordOrder = data.coordOrder
    changeOrder = False
    coordShift = 0
    marked = []
    board = user_boards.get(data.user_id)
    if board is None:
        board = boardSetUp(3)
    slideKey = "{{" + str(data.slide) + "}}"
    file1 = open('app/script.txt', 'r')
    lines = file1.readlines()
    curLine = 0
    while curLine < len(lines) and slideKey not in lines[curLine]:
        curLine += 1
    curLine += 1
    if ("2" in lines[curLine]):
        is2d = True
    if ("c" in lines[curLine]):
        manCoords = True
    if ("b" in lines[curLine]):
        btriangleShow = True
    if ("r" in lines[curLine]):
        rtriangleShow = True
    curLine += 1
    if (lines[curLine].strip() == "True"):
        curLine += 1
        size = int(lines[curLine].strip())
        board = boardSetUp(size)
        curLine += 1
        moves = lines[curLine].split("|")
        for move in moves:
            move = move.strip()
            if move == "":
                break
            player = move[0]
            coords = move[1:].split(",")
            if len(coords) == 4:
                for i in range(len(coords)):
                    coords[i] = int(coords[i].strip())
                if player == "b":
                    board["space"][coords[0]][coords[1]][coords[2]][coords[3]].changePlayer4d(1, board["space"], board["posSet"], board["zeroBounds"], board["fullBounds"])
                else:
                    board["space"][coords[0]][coords[1]][coords[2]][coords[3]].changePlayer4d(-1, board["space"], board["negSet"], board["zeroBounds"], board["fullBounds"])
    curLine += 1
    if (lines[curLine].strip() == "True"):
        curLine += 1
        coordShift = int(lines[curLine].strip())
        changeOrder = True
    curLine += 1
    marking = (lines[curLine].strip() == "True")
    if marking:
        curLine += 1
        hexMarks = lines[curLine].split("|")
        for hexMark in hexMarks:
            hexMark = hexMark.strip()
            if hexMark == "":
                break
            hexMark = hexMark.split(",")
            for i in range(len(hexMark)):
                hexMark[i] = int(hexMark[i].strip())
            marked.append(hexMark)
    curLine += 1
    text = lines[curLine]
    victory = 0
    if findSurface(board.get("posSet")):
        victory = 1
    elif findSurface(board.get("negSet")):
        victory = -1
    
    user_boards[data.user_id] = board
    return {"text": text, "victory": victory, "coordShift": coordShift, "changeOrder": changeOrder, "marked": marked, "board": boardTo4dArray(board.get("space"), coordOrder), "marked": marked, "size": size, "is2d": is2d, "manCoords": manCoords, "btriangleShow": btriangleShow, "rtriangleShow": rtriangleShow}

def adjBuilder(coords, first, sign, size):
  if first == len(coords):
    return [coords]
  adjSet = adjBuilder(coords, first + 1, sign, size)
  coords2 = coords.copy()
  if(coords2[first] + sign < size and coords2[first] + sign >= 0):
    coords2[first] = coords2[first] + sign
    adjSet.extend(adjBuilder(coords2, first + 1, sign, size))
  return adjSet

def adjInit(coords, size):
  posSet = adjBuilder(coords, 0, 1, size)
  posSet.pop(0)
  negSet = adjBuilder(coords, 0, -1, size)
  negSet.pop(0)
  posSet.extend(negSet)
  return posSet

def evalMove(cells):
    size = len(cells)
    tally = [[[[0]*size for i in range(size)] for j in range(size)] for k in range(size)]
    for i in range(100):
        simBoard = boardSetUp(size)
        for i in range(size):
            for j in range(size):
                for k in range(size):
                    for l in range(size):
                        hexChoice = cells[i][j][k][l].player
                        if hexChoice == 0:
                            hexChoice = random.choice([1, -1])
                        if hexChoice == 1:
                            simBoard.get("space")[i][j][k][l].changePlayer4d(hexChoice, simBoard.get("space"), simBoard.get("posSet"), simBoard.get("zeroBounds"), simBoard.get("fullBounds"))
                        if hexChoice == -1:
                            simBoard.get("space")[i][j][k][l].changePlayer4d(hexChoice, simBoard.get("space"), simBoard.get("negSet"), simBoard.get("zeroBounds"), simBoard.get("fullBounds"))
        victor = -1
        if (findSurface(simBoard.get("posSet"))):
            victor = 1
        for i in range(size):
            for j in range(size):
                for k in range(size):
                    for l in range(size):
                        if simBoard.get("space")[i][j][k][l].player == victor:
                            tally[i][j][k][l] += 1
    max = 0
    bestCoords = [0, 0, 0, 0]
    print(tally)
    for i in range(size):
        for j in range(size):
            for k in range(size):
                for l in range(size):
                    if (cells[i][j][k][l].player == 0):
                        if (tally[i][j][k][l] > max):
                            max = tally[i][j][k][l]
                            bestCoords = [i, j, k, l]
    print(max)
    return bestCoords

class Hex:

  def __init__(self, defCoords, defPlayer):
    self.coords = defCoords
    self.player = defPlayer
    self.edgeSet = []

  def changePlayer2d(self, player, space, cells, edges, boundSet):
    self.player = player
    cells.append(self)

    adjCoords = adjInit(self.coords, len(space))

    adjSet = []
    for adj in adjCoords:
      subspace = space
      for coord in adj:
        subspace = subspace[coord]
      adjSet.append(subspace)

    if self.coords[0] == 0:
      adjSet.append(boundSet[0])
    elif self.coords[0] == len(space) - 1:
      adjSet.append(boundSet[1])
    if self.coords[1] == 0:
      adjSet.append(boundSet[2])
    elif self.coords[1] == len(space[0]) - 1:
      adjSet.append(boundSet[3])

    for adj in adjSet:
      if adj.player == self.player:
        edges.append(Edge(self, adj))

  def changePlayer4d(self, player, space, set, zeroBounds, fullBounds):
    self.player = player

    adjCoords = adjInit(self.coords, len(space))

    edges = set.get("edges")
    triangles = set.get("triangles")

    adjSet = []
    for adj in adjCoords:
      subspace = space
      for coord in adj:
        subspace = subspace[coord]
      adjSet.append(subspace)

    for i in range(len(self.coords)):
      if self.coords[i] == 0:
        adjSet.append(zeroBounds[i])
      if self.coords[i] == len(space) - 1:
        adjSet.append(fullBounds[i])

    for adj in adjSet:
      if adj.player == self.player:
        newEdge = Edge(self, adj)
        edges.append(newEdge)
        self.edgeSet.append(newEdge)
        adj.edgeSet.append(newEdge)

    for i in range(len(self.edgeSet)):
      for otherEdge in self.edgeSet[i].ends[1].edgeSet:
        for k in range(i + 1, len(self.edgeSet)):
          if self.edgeSet[k].ends[1] in otherEdge.ends:
            newT = Triangle(otherEdge, self.edgeSet[i], self.edgeSet[k])
            triangles.append(newT)


  def string(self):
    return(str(self.coords) + str(self.player))

def create2dBoard(size):
    board = [[0]*size for i in range(size)]
    for i in range(size):
        for j in range(size):
            board[i][j] = Hex([i, j], 0)
    return board

def create4dBoard(size):
    board = [[[[0]*size for i in range(size)] for j in range(size)] for k in range(size)]
    for i in range(size):
        for j in range(size):
            for k in range(size):
                for l in range(size):
                    board[i][j][k][l] = Hex([i, j, k, l], 0)
    return board

class Edge:

  def __init__(self, hex1, hex2):
    self.ends = [hex1, hex2]
    self.index = 0

  def string(self):
    return(str(self.ends[0].coords) + "-" + str(self.ends[1].coords))

class Triangle:
  def __init__(self, edge1, edge2, edge3):
    self.edges = [edge1, edge2, edge3]
    self.vertices = [edge1.ends[0], edge1.ends[1]]
    if edge2.ends[0] not in self.vertices:
      self.vertices.append(edge2.ends[0])
    else:
      self.vertices.append(edge2.ends[1])
    self.player = self.vertices[0].player


  def string(self):
    return(self.edges[0].string() + ", " + self.edges[1].string() + ", " + self.edges[2].string())

def findLinear(cellSet, edgeSet):
  matrixArray = [[0]*(len(edgeSet) + 1) for i in range(len(cellSet))]
  for i in range(len(edgeSet)):
    matrixArray[cellSet.index(edgeSet[i].ends[0])][i] = 1
    matrixArray[cellSet.index(edgeSet[i].ends[1])][i] = 1
  matrixArray[0][len(edgeSet)] = 1
  matrixArray[1][len(edgeSet)] = 1

  matrix = GF2Matrix(matrixArray)

  rref = GF2Matrix.echelon_form(matrix)[0]

  rrefList = rref.to_list()

  lowestRow = len(rrefList) - 1
  lastCol = len(rrefList[lowestRow]) - 1

  lowEl = 0
  while lowEl == 0 and lowestRow > 0:
    lowestRow = lowestRow - 1
    lowEl = rrefList[lowestRow][lastCol]

  findPivot = 0
  while findPivot == 0 and lastCol > 0:
    lastCol = lastCol - 1
    findPivot = rrefList[lowestRow][lastCol]



  if findPivot == 1:
    return True

  return False

def boardToArray(space):
    return [[cell.player for cell in row] for row in space]

def boardTo4dArray(space, coordOrder):

    arrayBoard = [[[[0]*len(space) for i in range(len(space))] for j in range(len(space))] for k in range(len(space))]
    for i in range(len(space)):
        for j in range(len(space)):
            for k in range(len(space)):
                for l in range(len(space)):
                    coords = [i,j,k,l]
                    arrayBoard[coords[coordOrder[0]]][coords[coordOrder[1]]][coords[coordOrder[2]]][coords[coordOrder[3]]] = space[i][j][k][l].player

    return arrayBoard

def boardTextRep(board):
    boardString = ""
    for i in range(len(board)):
        for j in range(len(board) - i):
            boardString = boardString + "&nbsp;"
        for j in range(len(board[i])):
            if (board[i][j].player == -1):
                boardString = boardString + "- "
            elif (board[i][j].player == 1):
                boardString = boardString + "1 "
            elif (board[i][j].player == 0):
                boardString = boardString + "0 "
        boardString = boardString + "<br>"
    return boardString


def findSurface(set):
  edgeSet = set.get("edges")
  triangleSet = set.get("triangles")
  boundEdges = set.get("boundEdges")
  matrixArray = [[0]*(len(triangleSet) + 1) for i in range(len(edgeSet))]
  for i in range(len(edgeSet)):
    edgeSet[i].index = i

  for bound in boundEdges:
    matrixArray[bound.index][len(matrixArray[bound.index]) - 1] = 1

  for i in range(len(triangleSet)):
    for edge in triangleSet[i].edges:
      matrixArray[edge.index][i] = 1

  matrix = GF2Matrix(matrixArray)

  rref = GF2Matrix.echelon_form(matrix)[0]

  rrefList = rref.to_list()

  lastColSum = 0

  for i in range(len(rrefList)):
    lastColSum = lastColSum + rrefList[i][len(rrefList[i]) - 1]

  if lastColSum > 1:
    return True
  return False
