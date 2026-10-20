import test from "node:test";
import assert from "node:assert/strict";
import {commands} from "../src/commands.js";

test("all slash commands are valid and unique",()=>{
 const data=commands.map(item=>item.data.toJSON());
 const names=data.map(item=>item.name);
 assert.ok(names.length>=55,"expected expanded command catalogue");
 assert.equal(new Set(names).size,names.length,"duplicate slash command");
 for(const item of data){
  assert.match(item.name,/^[a-z0-9_-]{1,32}$/);
  assert.ok(item.description.length>=1&&item.description.length<=100);
 }
});
test("verified account commands are registered",()=>{
 const data=commands.map(item=>item.data.toJSON());
 const byName=new Map(data.map(item=>[item.name,item]));
 for(const name of ["login","signup","linkaccount","accounts","accountstats","unlinkaccount","mystats"]){
  assert.ok(byName.has(name),"missing account command "+name);
 }
 for(const name of ["login","linkaccount","accountstats","unlinkaccount"]){
  const option=byName.get(name)?.options?.find(item=>item.name==="service");
  assert.ok(option,"service must be selected for "+name);
  assert.equal(option.required,true);
 }
});
