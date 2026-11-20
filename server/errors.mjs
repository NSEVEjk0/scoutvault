export class UserError extends Error {
  constructor(message,status=400){super(message);this.statusCode=status;}
}
export const requireCondition=(condition,message,status=400)=>{if(!condition)throw new UserError(message,status);};
