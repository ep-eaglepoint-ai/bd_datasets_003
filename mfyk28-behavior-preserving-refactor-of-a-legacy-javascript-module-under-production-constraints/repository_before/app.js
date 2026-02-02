// legacy code
function f(a,b,c){
  let r=[]
  for(let i=0;i<a.length;i++){
    let x=a[i]
    if(x){
      let y=b[x]||0
      if(c){
        r.push(y+1)
      }else{
        r.push(y)
      }
    }else{
      r.push(0)
    }
  }
  return r
}

module.exports = { f }
