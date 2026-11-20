// Pure input policy shared by the column-arrow and tap-on-board controls.
export function canPlayColumn(board,width,height,column,kind='drop',disabled=false,turn=null,me=null) {
 if(disabled||!Array.isArray(board)||!Number.isInteger(width)||!Number.isInteger(height)||
    width<1||height<1||board.length!==width*height||
    !Number.isInteger(column)||column<0||column>=width)return false;
 if(turn!==null && me!==null && turn!==me)return false;
 if(kind==='blast')return Number(board[(height-1)*width+column])!==0;
 return Number(board[column])===0;
}
// On small phones a 14-column board must be swipable rather than forcing tiny
// targets. TV displays continue to fit the complete grid without scrolling.
export function wideBoardMinWidth(width,readOnly=false) {
 return !readOnly&&width>=12?width*40:0;
}
