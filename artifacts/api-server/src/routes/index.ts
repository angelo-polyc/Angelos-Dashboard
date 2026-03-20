import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recessionRouter from "./recession";

const router: IRouter = Router();

router.use(healthRouter);
router.use(recessionRouter);

export default router;
