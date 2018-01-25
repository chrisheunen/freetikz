/* FreeTikz, written by Chris Heunen <chris.heunen@ed.ac.uk>, 2018 */

/* PARAMETERS */

var strokeWidth = 2; // how wide strokes in html svg element are
var smoothingFactor = 6; // how much strokes in html svg element are dynamically smoothed out while drawing
var segmentationThreshold = 70.0; // how close two segments have to be to be considered part of one shape
var convexityThreshold = 0.5; // how nonconcave a shape has to be to be considered convex
var openThreshold = 0.1; // how close endpoints of a path have to be for it to be considered a closed shape
var connectThreshold = 50.0; // how close a wire has to be to a shape to connect to it
var angleThreshold = 5.0; // how close an segment of a wire needs to be to a right angle 
var angleSnapThreshold = 45; // wire angles will be rounded to multiples of this many degrees
var grid = 0.5; // how large the grid is that coordinates are snapped to

/* SMOOTH SVG DRAWING */

var svg = null;
var rect = null;
var svgpath = null;
var strPath = null;
var buffer = [];
var latex = null;
var d3svg = null;

function setup() {
  latex = document.getElementById("latex");

  d3svg = d3.select("#svg");
  svg = document.getElementById("svg");
  rect = svg.getBoundingClientRect();

  svg.addEventListener("touchstart", function(e) { pointerDown(e); e.stopPropagation; e.preventDefault(); });
  svg.addEventListener("mousedown", pointerDown);

  svg.addEventListener("touchmove", function(e) { pointerMove(e); e.stopPropagation; e.preventDefault(); });
  svg.addEventListener("mousemove", pointerMove);

  svg.addEventListener("touchend", function(e) { pointerUp(e); e.stopPropagation; e.preventDefault(); });
  svg.addEventListener("mouseup", pointerUp);
}

var pointerDown = function(e) { 
    if (pencil) {
      svgpath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svgpath.setAttribute("fill", "none");
      svgpath.setAttribute("stroke", "#000");
      svgpath.setAttribute("stroke-width", strokeWidth);
      buffer = [];
      var pt = getMousePosition(e);
      appendToBuffer(pt);
      strPath = "M" + pt.x + " " + pt.y;
      svgpath.setAttribute("d", strPath);
      svg.appendChild(svgpath);
    } else if (eraser) {
      erase(getMousePosition(e));
    }
};

var pointerMove = function (e) {
    if (pencil) {
      if (svgpath) {
          appendToBuffer(getMousePosition(e));
          updateSvgPath();
      }
    } else if (eraser) {
      erase(getMousePosition(e));
    }
};

var pointerUp = function () {
  if (svgpath) svgpath = null;
  updateLatex();
};

var getMousePosition = function (e) {
    return {
        x: e.pageX - rect.left,
        y: e.pageY - rect.top
    }
};

var appendToBuffer = function (pt) {
    buffer.push(pt);
    while (buffer.length > smoothingFactor) {
        buffer.shift();
    }
};

var getAveragePoint = function (offset) {
    var len = buffer.length;
    if (len % 2 === 1 || len >= smoothingFactor) {
        var totalX = 0;
        var totalY = 0;
        var pt, i;
        var count = 0;
        for (i = offset; i < len; i++) {
            count++;
            pt = buffer[i];
            totalX += pt.x;
            totalY += pt.y;
        }
        return {
            x: totalX / count,
            y: totalY / count
        }
    }
    return null;
};

var updateSvgPath = function () {
    var pt = getAveragePoint(0);
    if (pt) {
        strPath += " L" + pt.x + " " + pt.y;
        var tmpPath = "";
        for (var offset = 2; offset < buffer.length; offset += 2) {
            pt = getAveragePoint(offset);
            tmpPath += " L" + pt.x + " " + pt.y;
        }
        svgpath.setAttribute("d", strPath + tmpPath);
    }
};

/* CALCULATE PROPERTIES OF POLYGON FOR CLASSIFICATION */

function svgPathToList(svgPath) {
  var src=svgPath.split(/(?=[LM])/);
  var path = [];
  for (var i = 0; i < src.length; i++) {
  	var seg = src[i].replace(/L /g,'').replace(/M /g,'').replace(/L/g,'').replace(/M/g,'');
  	var point = seg.split(' ');
    path.push([parseFloat(point[0]), parseFloat(point[1])]);
    // path.push({ x : parseFloat(point[0]), y : parseFloat(point[1])});
  }
  return path;
}

function distance(a,b) {
  var x = b[0]-a[0];
  var y = b[1]-a[1];
  return Math.sqrt(x*x+y*y);
}

function BoundingBox(path) {
  var minX, maxX, minY, maxY;
  for (var i=0; i<path.length; i++) {
    minX = (path[i][0] < minX || minX == null) ? path[i][0] : minX;
    maxX = (path[i][0] > maxX || maxX == null) ? path[i][0] : maxX;
    minY = (path[i][1] < minY || minY == null) ? path[i][1] : minY;
    maxY = (path[i][1] > maxY || maxY == null) ? path[i][1] : maxY;
  }
  return [[minX,minY],[maxX,maxY]];
}

function Compactness(area,perimeter) {
  return 2 * Math.sqrt(area * Math.PI) / perimeter;
}

function Eccentricity(path,centre) {
  var centredpath = [];
  for (var i=0; i<path.length; i++) centredpath.push( [path[i][0]-centre[0], path[i][1]-centre[1]]  );
  var covariance = [0,0,0,0];
  for (i=0; i<centredpath.length; i++) {
  	covariance[0] += centredpath[i][0] * centredpath[i][0];
  	covariance[1] += centredpath[i][0] * centredpath[i][1];
  	covariance[2] += centredpath[i][1] * centredpath[i][0];
  	covariance[3] += centredpath[i][1] * centredpath[i][1];
  }
  var b = Math.sqrt( Math.pow(covariance[0]+covariance[3], 2) - 4*(covariance[0] * covariance[3] - Math.pow(covariance[1],2)) );
  var lambda1 = covariance[0] + covariance[3] + b;
  var lambda2 = covariance[0] + covariance[3] - b;
  return lambda2 / lambda1;
}

function angularity(boundingbox,area) {
  var boundarea = (boundingbox[1][0]-boundingbox[0][0]) * (boundingbox[1][1]-boundingbox[0][1]);
  return area / boundarea;
}

function Rectangularity(boundingbox,area) {
  var boundarea = (boundingbox[1][0]-boundingbox[0][0]) * (boundingbox[1][1]-boundingbox[0][1]);
  return area / boundarea;
}

function Circularity(path,centre,area) {
  var furthestdistance = 0;
  for (var i=0; i<path.length; i++) {
  	var d=distance(path[i],centre);
  	if (d>furthestdistance) furthestdistance = d;
  }
  var circlearea = Math.PI * Math.pow(furthestdistance,2);
  return area / circlearea;
}

function AspectRatio(boundingbox) {
  return (boundingbox[1][0]-boundingbox[0][0]) / (boundingbox[1][1]-boundingbox[0][1]);
}

function isConvex(path, area, threshold) {
  var convexhullArea = d3.polygonArea(d3.polygonHull(path));
  return ( (area / convexhullArea) >= threshold)
}

function isOpen(path, perimeter, threshold) {
  var ratio = distance(path[0], path[path.length-1]) / perimeter;
  return (ratio > threshold);
}

function Orientation(path,centre) {
  var corner = path[0];
  var furthestdistance = distance(corner,centre);
  for (var i=1; i<path.length; i++) {
  	var d=distance(path[i],centre);
  	if (d>furthestdistance) { furthestdistance = d; corner = path[i];}
  }
  var dx = corner[0]-centre[0];
  var dy = corner[1]-centre[1];
  if (dx<0 && dy<0) return ", hvflip";
  if (dx>=0 && dy<0) return ", hflip";
  if (dx>=0 && dy>=0) return "";
  return ", vflip";
}

/* CLASSIFY SHAPES */

function updateLatex() {
  var pathlist = [];
  d3svg.selectAll("path").each(function(d, i) {
    var p = svgPathToList(this.getAttribute('d'));
    if (p.length>1) pathlist.push(p);
  });
  var wires = [];
  var dots = [];
  var morphisms = [];
  for (var i=0; i<pathlist.length; i++) {
    /* calculate properties of polygon */
  	var path = pathlist[i];
    var boundingbox = BoundingBox(path);
    var centre = d3.polygonCentroid(path);
    var area = Math.abs(d3.polygonArea(path));
    var perimeter = d3.polygonLength(path);
    var compactness = Compactness(area,perimeter);
    var eccentricity = Eccentricity(path,centre);
    var rectangularity = Rectangularity(boundingbox,area);
    var circularity = Circularity(path,centre,area);
    var aspectratio = AspectRatio(boundingbox);
    var convex = isConvex(path,area, convexityThreshold);
    var open = isOpen(path,perimeter, openThreshold);
    var orientation = Orientation(path,centre);

    /* classify the shape */
    /* This is a hack, and should be done by training a Support Vector Machine instead */
    if (open || !convex) 
    	wires.push(path);
    else if (circularity > 0.5) 
    	dots.push([path,centre]);
    else if (rectangularity > 0.5 && circularity < 0.5) 
    	morphisms.push([path,centre,orientation]);
    else 
    	wires.push(path);
  }

  var annotatedwires = connect(wires,dots,morphisms);
  latex.value = generateLatex(dots,morphisms,annotatedwires);
}

/* GENERATE LATEX CODE */

function bestConnection(point, dots, morphisms) {
  var bestDistance = connectThreshold;
  var bestConnection = "";
  for (var d=0; d<dots.length; d++) {
    if (d3.polygonContains(dots[d][0], point)) return "d" + d + ".center";
    var dist = distance( dots[d][1], point );
    if (dist<bestDistance) {
      bestDistance = dist;
      bestConnection = "d" + d + ".center";
    }
  }
  for (var m=0; m<morphisms.length; m++) {
    if (d3.polygonContains(morphisms[m][0],point)) return "m" + m;
    var dist = distance( morphisms[m][1], point );
    if (dist<bestDistance) {
      bestDistance = dist;
      bestConnection = "m" + m;
    }
  }
  if (bestDistance < connectThreshold) return bestConnection;
  else return latexCoords(point);
}

function connect(wires, dots, morphisms) {
	annotatedwires = [];
	for (var i=0; i<wires.length; i++) {
		wire = wires[i];
		begin = bestConnection(wire[0], dots, morphisms);
		end = bestConnection(wire[wire.length-1], dots, morphisms);
    annotatedwires.push([wire,begin,end]);
	}
	return annotatedwires;
}

Number.prototype.mround = function(_mult) {
    var base = Math.abs(this);
    var mult = Math.abs(_mult);
    var mod = (base % mult);
    if (mod <= (mult / 2)) { 
        base -= mod;
    } else {
        base += (mult - mod);
    }
    return (this<0)?-base:base ;
}

function latexCoords(point) {
  var x = point[0];
  var y = point[1];
  return parseFloat(x*10/svg.getBoundingClientRect().width).mround(grid).toFixed(2)*1 
    + ", " + parseFloat(10-y*10/svg.getBoundingClientRect().height).mround(grid).toFixed(1)*1
}

function snapAngle(angle) {
  var snapangle=parseFloat(angle).mround(angleSnapThreshold);
  if (snapangle==-180) snapangle=180;
  if (snapangle==-0) snapangle=0;
  return snapangle;
}

function isHorizontalOrVertical(angle) {
  var snapangle = Math.abs(angle) % 90;
  var snap = (snapangle<angleThreshold) || (snapangle>90-angleThreshold);
  return snap;
}

function Angle(begin, end) {
  var dx = end[0]-begin[0];
  var dy = end[1]-begin[1];
  var angle = Math.atan2(-dy,dx);
  return angle*180.0/Math.PI;
}

function showDot(point, color) {
  var svgns = "http://www.w3.org/2000/svg";
  var dot = document.createElementNS(svgns, 'circle');
  dot.setAttributeNS(null, 'cx', point[0]);
  dot.setAttributeNS(null, 'cy', point[1]);
  dot.setAttributeNS(null, 'r', 2);
  dot.setAttributeNS(null, 'style', 'fill:'+color+'; stroke: black; stroke-width: 1px;');
  svg.appendChild(dot);
}

function simplifyWire(wire) {
  // for (var i=0; i<wire.length; i++) showDot(wire[i],'blue');
  // var s = simplify(wire, 30, true);
  // for (var i=0; i<s.length; i++) showDot(s[i], 'red');

  var angledwire=[[wire[0],999,snapAngle(Angle(wire[0],wire[1]))]];
  for (var i=1; i<wire.length-2; i++) {
    angledwire.push([wire[i], snapAngle(Angle(wire[i],wire[i-1])), snapAngle(Angle(wire[i],wire[i+1]))]);
    // showDot(wire[i],'blue');
  }
  angledwire.push([wire[wire.length-1], snapAngle(Angle(wire[wire.length-1], wire[wire.length-2])), 999]);

  var simplewire=[angledwire[0]];
  // insert points with horizontal or vertical tangent that are not in the list
  // take out points that do not have a nearly horizontal or vertical tangent
  for (var i=1; i<angledwire.length-2; i++) {
    if (isHorizontalOrVertical(angledwire[i][1])) { 
      simplewire.push(angledwire[i]);
      // showDot(angledwire[i][0],'green');
    }
  }
  simplewire.push(angledwire[angledwire.length-1]);

  // delete 'pass-through' points 
  var sparsewire=[simplewire[0]];
  // showDot(sparsewire[0][0],'red');
  for (var i=1; i<simplewire.length-1; i++) {
    // console.log(simplewire[i][1] + "   " + simplewire[i-1][2]);
    if (Math.abs(simplewire[i][1]-simplewire[i-1][2])!=180) {
      sparsewire.push(simplewire[i]);
      // showDot(simplewire[i][0], 'red');
    }
  }
  var last = sparsewire[sparsewire.length-1];
  var final = simplewire[simplewire.length-1];
  if (Math.abs(final[1]-last[2])==180 && sparsewire.length>1)
    sparsewire.pop();
  sparsewire.push(final);
  // showDot(final[0],'red');
  return sparsewire;
}

function anchor(node, angle, point, morphisms, wires) {
  if (node[0]=='m') {
    var morphismnr = node.substr(1,node.length-1);
    var morphism = morphisms[morphismnr];    
    var morphismcentre = morphism[1];

    var nrNorthConnections = 0;
    var nrSouthConnections = 0;
    for (var i=0; i<wires.length; i++) {
      if (wires[i][1]==node) {
        var wirepoint = wires[i][0][0];
        if (wirepoint[1] < morphismcentre[1]) nrNorthConnections++;
        else nrSouthConnections++;
      }
      if (wires[i][2]==node) {
        var wirepoint = wires[i][0][wires[i].length-1];
        if (wirepoint[1] < morphismcentre[1]) nrNorthConnections++;
        else nrSouthConnections++;
      }
    }

    if (nrNorthConnections==1 && point[1] <= morphismcentre[1]) return node+'.north';
    if (nrSouthConnections==1 && point[1] >= morphismcentre[1]) return node+'.south';

    if (nrNorthConnections==2 && point[1] <= morphismcentre[1]) {
      if (point[0] <= morphismcentre[0]) return node+'.north west';
      else return node+'.north east';
    }
    if (nrSouthConnections==2 && point[1] >= morphismcentre[1]) {
      if (point[0] <= morphismcentre[0]) return node+'.south west';
      else return node+'.south east';
    }

    var morphismbbox = BoundingBox(morphism[0]);
    var left = morphismbbox[0][0];
    var right = morphismbbox[1][0];
    var width = right-left;

    if (nrNorthConnections==3 && point[1] <= morphismcentre[1]) {
      if (point[0] < morphismcentre[0] - width/6)       return node+'.north west';
      else if (point[0] > morphismcentre[0] + width/6)       return node+'.north east';
      else return node+'.north';
    }
    if (nrSouthConnections==3 && point[1] >= morphismcentre[1]) {
      if (point[0] < morphismcentre[0] - width/6)       return node+'.south west';
      else if (point[0] > morphismcentre[0] + width/6)       return node+'.south east';
      else return node+'.south';
    }

    return node+'.'+angle;
  }
  return node;
}

function latexWire(wire, begin, end, morphisms, wires) {
  var simplewire = simplifyWire(wire);
  var latex = "  \\draw ("
  latex += anchor(begin, simplewire[0][2], simplewire[0][0], morphisms, wires) + ")";
  for (var i=1; i<simplewire.length-1; i++) {
    latex += " to[out=" + simplewire[i-1][2] + ", in=" + simplewire[i][1] + "] (";
    latex += latexCoords(simplewire[i][0]);
    // showDot(simplewire[i][0],'red');
    latex += ")";
  }
  latex += " to[out=" + simplewire[simplewire.length-2][2] + ", in=" + simplewire[simplewire.length-1][1] + "] ("
  latex += anchor(end, simplewire[simplewire.length-1][1], simplewire[simplewire.length-1][0], morphisms, wires);
  latex += ");\n"
  return latex;
}

function generateLatex(dots, morphisms, annotatedwires) {
  var latex = "\\documentclass{standalone}\n\\usepackage{freetikz}\n\\begin{document}\n\\begin{tikzpicture}\n";
  for (var i=0; i<dots.length; i++) {
  	var dot = dots[i][1];
  	latex += "  \\node[dot] (d" + i + ") at (" + latexCoords(dot) + ") {};\n"
  }
  for (var i=0; i<morphisms.length; i++) {
  	var morphism = morphisms[i];
  	latex += "  \\node[morphism" + morphism[2] + "] (m" + i + ") at (" + latexCoords(morphism[1]) + ") {m"+i+"};\n"
  }
  for (var i=0; i<annotatedwires.length; i++) {
    var annotatedwire = annotatedwires[i];
    var wire = annotatedwire[0];
    var begin = annotatedwire[1];
    var end = annotatedwire[2];
    latex += latexWire(wire, begin, end, morphisms, annotatedwires);
  }
  latex += "\\end{tikzpicture}\n\\end{document}"
  return latex;
}

/* USER INTERFACE */

var pencil = true;
var eraser = false;

function toolbar() {
  pencil = document.getElementById("switch_pencil").checked;
  eraser = document.getElementById("switch_eraser").checked;
}

function erase(pt) {
  var path = document.elementFromPoint(pt.x, pt.y);
  if (path.tagName=="path") {
    path.remove();
    updateLatex();
  }
}

d3.select("body").on("keydown", function() { if (d3.event.keyCode==90) undo(); });

function undo() {
  d3.select('#svg>path:last-child').remove();
  updateLatex();
}
