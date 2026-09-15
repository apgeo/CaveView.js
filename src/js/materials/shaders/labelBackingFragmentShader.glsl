uniform vec3 backingColor;
uniform float backingOpacity;

void main() {

	gl_FragColor = vec4( backingColor, backingOpacity );

}
