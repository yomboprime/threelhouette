//
// This code is released under public domain at 1 Feb 2020.
// https://github.com/yomboprime/threelhouette
//


// Imports

var fs = require( "fs" );
var PNG = require( 'pngjs' ).PNG;
var pathJoin = require( 'path' ).join;
var THREE = require( './three.min.js' );
var BufferGeometryUtils = require( './BufferGeometryUtils.js' );
var STLExporterOptimized = require( './STLExporterOptimized.js' );

// Main code

if ( process.argv.length < 5 ) {
	
	console.error( "\n\n Usage: provide 3 arguments with the paths to 3 PNG images (xy, xz and zy)\n" );
	process.exit( -1 );

}

var filePathXY = pathJoin( __dirname, process.argv[ 2 ] );
var filePathXZ = pathJoin( __dirname, process.argv[ 3 ] );
var filePathZY = pathJoin( __dirname, process.argv[ 4 ] );

var imageXY = loadBitmap( filePathXY );
var imageXZ = loadBitmap( filePathXZ );
var imageZY = loadBitmap( filePathZY );

console.log( "\n" );
console.log( "Processing images..." );

if ( imageXY.width !== imageXZ.width ) {
	
	console.error( "\n\n Error: The XY image must have the same width as the XZ image.\n" );
	process.exit( -1 );

}

if ( imageXY.height !== imageZY.height ) {
	
	console.error( "\n\n Error: The XY image must have the same height as the YZ image.\n" );
	process.exit( -1 );

}

if ( imageXZ.height !== imageZY.width ) {
	
	console.error( "\n\n Error: The XZ image height must have the same as the ZY image width.\n" );
	process.exit( -1 );

}

thresholdBitmap( imageXY );
thresholdBitmap( imageXZ );
thresholdBitmap( imageZY );

var nx = imageXY.width;
var ny = imageXY.height;
var nz = imageXZ.height;

console.log( "Generating voxels..." );

var voxels = [];
var nv = 0;
var p = 0;
for ( var i = 0; i < nx; i ++ ) {
	for ( var j = 0; j < ny; j ++ ) {
		for ( var k = 0; k < nz; k ++ ) {

			var v = getPixel( imageXY, i, j ) && getPixel( imageXZ, i, k ) && getPixel( imageZY, k, j );

			if ( v ) nv ++;

			voxels[ p ] = v;

			p++;

		}
	}
}

console.log( "Num of solid voxels: " + nv );

console.log( "Generating error images..." );

var errorXY = generateErrorImage( imageXY, nx, ny, nz, 0, 1, 2 );
var errorXZ = generateErrorImage( imageXZ, nx, ny, nz, 0, 2, 1 );
var errorZY = generateErrorImage( imageZY, nx, ny, nz, 2, 1, 0 );

saveBitmap( filePathXY, "_Error_XY", imageXY );
saveBitmap( filePathXZ, "_Error_XZ", imageXZ );
saveBitmap( filePathZY, "_Error_ZY", imageZY );

if ( errorXY ) console.log( "There were errors in the XY image." );
if ( errorXZ ) console.log( "There were errors in the XZ image." );
if ( errorZY ) console.log( "There were errors in the ZY image." );

console.log( "Generating mesh..." );

var geometry = generateGeometry();

console.log( "Number of vertices: " + geometry.getAttribute( 'position' ).array.length / 3 );

voxels = null;

console.log( "Indexing mesh..." );

var indexedGeometry = BufferGeometryUtils.mergeVertices( geometry );

console.log( "Writing STL mesh file..." );

var outSTLPath = filePathXY + "_Model.stl";
var dotPos = filePathXY.lastIndexOf( "." );
if ( dotPos > 0 ) {
	outSTLPath = filePathXY.substring( 0, dotPos ) + "_Model.stl";
}

var binarySTLContent = ( new STLExporterOptimized() ).parse( new THREE.Mesh( indexedGeometry, new THREE.MeshBasicMaterial() ) );

fs.writeFileSync( outSTLPath, Buffer.from( binarySTLContent ) );

console.log( "\nDone." );

// Functions

function getVoxelP( i, j, k ) {

	return k + nz * ( j + ny * i );
	
}

function getVoxelPArr( cArr ) {

	return cArr[ 2 ] + nz * ( cArr[ 1 ] + ny * cArr[ 0 ] );
	
}

function getPixel( png, x, y ) {

	return png.data[ 4 * ( x + ( png.height - y ) * png.width ) ] === 0;
	
}

function setPixel( png, x, y, r, g, b ) {

	var p = 4 * ( x + ( png.height - y ) * png.width );
	
	png.data[ p ] = r;
	png.data[ p + 1 ] = g;
	png.data[ p + 2 ] = b;
	
}

function thresholdBitmap( png ) {

	var w = png.width;
	var h = png.height;
	var d = png.data;
	
	var p = 0;
	for ( var j = 0; j < h; j ++ ) {
		for ( var i = 0; i < w; i ++ ) {
			
			var v = d[ p ] < 128 ? 0 : 255;
			
			d[ p ] = v;
			d[ p + 1 ] = v;
			d[ p + 2 ] = v;
			d[ p + 3 ] = 255;
			
			p += 4;
			
		}
	}

}

function generateErrorImage( png, sx, sy, sz, a, b, c ) {

	var nArr = [ sx, sy, sz ];
	var sx = nArr[ a ];
	var sy = nArr[ b ];
	var sz = nArr[ c ];
	
	var cArr = [ 0, 0, 0, ];
	
	var foundError = false;
	
	for ( var y = 0; y < sy; y ++ ) {
		
		cArr[ b ] = y;
		
		for ( var x = 0; x < sx; x ++ ) {
			
			cArr[ a ] = x;
			
			if ( getPixel( png, x, y ) ) {

				var found = false;
				for ( var z = 0; z < sz; z ++ ) {
					
					cArr[ c ] = z;
					
					if ( voxels[ getVoxelPArr( cArr ) ] ) {
					
						found = true;
						break;
						
					}
				}
				
				if ( ! found ) {

					setPixel( png, x, y, 255, 0, 255 );
					foundError = true;

				}
				
			}
			
		}
		
	}
	
	return foundError;
	
}

function generateGeometry() {

	var numQuads = 0;

	for ( var i = 0; i < nx; i ++ ) {
		for ( var j = 0; j < ny; j ++ ) {
			for ( var k = 0; k < nz; k ++ ) {

				if ( voxels[ getVoxelP( i, j, k ) ] ) {

					// Front face
					if ( k === 0 || ! voxels[ getVoxelP( i, j, k - 1 ) ] ) numQuads ++;
					
					// Back face
					if ( ( k === nz - 1 ) || ! voxels[ getVoxelP( i, j, k + 1 ) ] ) numQuads ++;

					// Left face
					if ( i === 0 || ! voxels[ getVoxelP( i - 1, j, k ) ] ) numQuads ++;
					
					// Right face
					if ( ( i === nx - 1 ) || ! voxels[ getVoxelP( i + 1, j, k ) ] ) numQuads ++;

					// Bottom face
					if ( j === 0 || ! voxels[ getVoxelP( i, j - 1, k ) ] ) numQuads ++;
					
					// Top face
					if ( ( j === ny - 1 ) || ! voxels[ getVoxelP( i, j + 1, k ) ] ) numQuads ++;

				}

			}
		}
	}
	
	console.log( "Number of quads: " + numQuads );

	var geometry = new THREE.BufferGeometry();
	var numVerts = 6 * numQuads;
	var vertices = new Float32Array( numVerts * 3 );
	
	var currentVertex = 0;

	function generateQuad( i, j, k, a, b, invertNormal ) {
		
		var iIncX = 0;
		var jIncX = 0;
		var kIncX = 0;
		var iIncY = 0;
		var jIncY = 0;
		var kIncY = 0;
		
		if ( a === 0 ) {
			iIncX ++;
		}
		else if ( a === 1 ) {
			jIncX ++;
		}
		else {
			kIncX ++;
		}

		if ( b === 0 ) {
			iIncY ++;
		}
		else if ( b === 1 ) {
			jIncY ++;
		}
		else {
			kIncY ++;
		}

		var coord = currentVertex * 3;

		if ( ! invertNormal ) {
			
			vertices[ coord ++ ] = i;
			vertices[ coord ++ ] = j;
			vertices[ coord ++ ] = k;

			vertices[ coord ++ ] = i + iIncX;
			vertices[ coord ++ ] = j + jIncX;
			vertices[ coord ++ ] = k + kIncX;
			
			vertices[ coord ++ ] = i + iIncX + iIncY;
			vertices[ coord ++ ] = j + jIncX + jIncY;
			vertices[ coord ++ ] = k + kIncX + kIncY;

			vertices[ coord ++ ] = i;
			vertices[ coord ++ ] = j;
			vertices[ coord ++ ] = k;

			vertices[ coord ++ ] = i + iIncX + iIncY;
			vertices[ coord ++ ] = j + jIncX + jIncY;
			vertices[ coord ++ ] = k + kIncX + kIncY;

			vertices[ coord ++ ] = i + iIncY;
			vertices[ coord ++ ] = j + jIncY;
			vertices[ coord ++ ] = k + kIncY;

		}
		else {

			vertices[ coord ++ ] = i;
			vertices[ coord ++ ] = j;
			vertices[ coord ++ ] = k;

			vertices[ coord ++ ] = i + iIncX + iIncY;
			vertices[ coord ++ ] = j + jIncX + jIncY;
			vertices[ coord ++ ] = k + kIncX + kIncY;
			
			vertices[ coord ++ ] = i + iIncX;
			vertices[ coord ++ ] = j + jIncX;
			vertices[ coord ++ ] = k + kIncX;

			vertices[ coord ++ ] = i;
			vertices[ coord ++ ] = j;
			vertices[ coord ++ ] = k;

			vertices[ coord ++ ] = i + iIncY;
			vertices[ coord ++ ] = j + jIncY;
			vertices[ coord ++ ] = k + kIncY;
			
			vertices[ coord ++ ] = i + iIncX + iIncY;
			vertices[ coord ++ ] = j + jIncX + jIncY;
			vertices[ coord ++ ] = k + kIncX + kIncY;
		
		}

		currentVertex += 6;

	}

	for ( var i = 0; i < nx; i ++ ) {
		for ( var j = 0; j < ny; j ++ ) {
			for ( var k = 0; k < nz; k ++ ) {

				if ( voxels[ getVoxelP( i, j, k ) ] ) {

					// Front face
					if ( k === 0 || ! voxels[ getVoxelP( i, j, k - 1 ) ] ) generateQuad( i, j, k, 0, 1, false );
					
					// Back face
					if ( ( k === nz - 1 ) || ! voxels[ getVoxelP( i, j, k + 1 ) ] ) generateQuad( i, j, k + 1, 0, 1, k, true );

					// Bottom face
					if ( j === 0 || ! voxels[ getVoxelP( i, j - 1, k ) ] ) generateQuad( i, j, k, 0, 2, false );
					
					// Top face
					if ( ( j === ny - 1 ) || ! voxels[ getVoxelP( i, j + 1, k ) ] ) generateQuad( i, j + 1, k, 0, 2, true );

					// Left face
					if ( i === 0 || ! voxels[ getVoxelP( i - 1, j, k ) ] ) generateQuad( i, j, k, 2, 1, false );
					
					// Right face
					if ( ( i === nx - 1 ) || ! voxels[ getVoxelP( i + 1, j, k ) ] ) generateQuad( i + 1, j, k, 2, 1, true );

				}

			}
		}
	}

	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
	
	return geometry;

}

function loadBitmap( path ) {

	var data = null;
	try {

		data = fs.readFileSync( path );
		
	}
	catch ( e ) {
		data = null;
	}
	
	if ( ! data ) {
		
		console.error( "Invalid path or image: " + path );
		process.exit( -1 );
		
	}

	var png = PNG.sync.read( data );
	
	if ( ! png ) {
		
		console.error( "Invalid image: " + path );
		process.exit( -1 );
		
	}

	return png;

}

function saveBitmap( path, suffix, png ) {
	
	var outImagePath = path + suffix + ".png";
	var dotPos = path.lastIndexOf( "." );
	if ( dotPos > 0 ) {
		outImagePath = path.substring( 0, dotPos ) + suffix + ".png";
	}

	var pngFileData = PNG.sync.write( png, { colorType: 6 } );

	fs.writeFileSync( outImagePath, pngFileData );

}
