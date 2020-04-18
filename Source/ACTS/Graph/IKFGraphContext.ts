import {KFScriptContext} from "../../KFScript/KFScriptDef";
import {KFDName} from "../../KFData/Format/KFDName";

export interface IKFGraphContext
{
    //兼容KFSCRIPTCONTEXT的类型用any
    runtime:any;
    //兼容KFSCRIPTCONTEXT的类型用any
    targetObject:any;
    //
    script:KFScriptContext;

    Input(blockname:KFDName, arg:any);
}