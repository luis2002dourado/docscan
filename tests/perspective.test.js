import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderQuad,isValidQuad,solveHomography,applyHomography} from '../public/vision.js';
const points=[{x:340,y:60},{x:540,y:290},{x:740,y:590},{x:80,y:500}];
test('perspectiva forte: quatro cantos distintos e ordem cíclica',()=>{
 for(const input of [points,[points[2],points[0],points[3],points[1]],points.toReversed()]) {
  const q=orderQuad(input);assert.equal(new Set(q.map(p=>`${p.x},${p.y}`)).size,4);assert.ok(isValidQuad(q,800,720));assert.deepEqual(q,points);
 }
});
test('homografia leva cada canto a um canto do retângulo',()=>{
 const target=[{x:0,y:0},{x:479,y:0},{x:479,y:649},{x:0,y:649}],h=solveHomography(points,target);
 points.forEach((p,i)=>{const t=applyHomography(h,p.x,p.y);assert.ok(Math.hypot(t.x-target[i].x,t.y-target[i].y)<1e-6);});
});
test('recorte manual rejeita cantos cruzados, repetidos e fora da imagem',()=>{
 assert.equal(isValidQuad([points[0],points[2],points[1],points[3]],800,720),false);
 assert.equal(isValidQuad([points[0],points[0],points[2],points[3]],800,720),false);
 assert.equal(isValidQuad([{x:-1,y:60},...points.slice(1)],800,720),false);
});
test('homografia degenerada falha explicitamente',()=>{
 assert.throws(()=>solveHomography([{x:1,y:1},{x:2,y:2},{x:3,y:3},{x:4,y:4}],points),/degenerados/);
});
