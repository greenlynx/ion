import { ComponentResourceOptions, output, Output } from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { Component, Transform, transform } from "../component";
import { Function, FunctionArgs } from "./function";
import { Input } from "../input.js";

export interface CronArgs {
  /**
   * The function that'll be executed when the cron job runs.
   *
   * @example
   *
   * ```ts
   * {
   *   job: "src/cron.handler"
   * }
   * ```
   *
   * Alternatively, you can pass in the full function props.
   *
   * ```ts
   * {
   *   job: {
   *     handler: "src/cron.handler",
   *     timeout: "60 seconds",
   *   }
   * }
   * ```
   */
  job: Input<string | FunctionArgs>;
  /**
   * The schedule for the cron job.
   *
   * @example
   *
   * You can use a [rate expression](https://docs.aws.amazon.com/lambda/latest/dg/services-cloudwatchevents-expressions.html).
   *
   * ```ts
   * {
   *   schedule: "rate(5 minutes)"
   *   // schedule: "rate(1 minute)"
   *   // schedule: "rate(5 minutes)"
   *   // schedule: "rate(1 hour)"
   *   // schedule: "rate(5 hours)"
   *   // schedule: "rate(1 day)"
   *   // schedule: "rate(5 days)"
   * }
   * ```
   * Or a [cron expression](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule-schedule.html#eb-cron-expressions).
   *
   * ```ts
   * {
   *   schedule: "cron(15 10 * * ? *)", // 10:15 AM (UTC) every day
   * }
   * ```
   */
  schedule: Input<`rate(${string})` | `cron(${string})`>;
  /**
   * [Transform](/docs/components#transform/) how this component creates its underlying resources.
   */
  transform?: {
    /**
     * Transform the EventBridge Rule resource.
     */
    rule?: Transform<aws.cloudwatch.EventRuleArgs>;
    /**
     * Transform the EventBridge Target resource.
     */
    target?: Transform<aws.cloudwatch.EventTargetArgs>;
  };
}

/**
 * The `Cron` component lets you add cron jobs to your app.
 * It uses [Amazon Event Bus](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-bus.html).
 *
 * @example
 * #### Example
 *
 * Pass in a `schedule` and a `job` function that'll be executed.
 *
 * ```ts
 * new sst.aws.Cron("MyCronJob", {
 *   job: "src/cron.handler",
 *   schedule: "rate(1 minute)",
 * });
 * ```
 */
export class Cron extends Component {
  private fn: Output<Function>;
  private rule: aws.cloudwatch.EventRule;
  private target: aws.cloudwatch.EventTarget;

  constructor(name: string, args: CronArgs, opts?: ComponentResourceOptions) {
    super("sst:aws:Cron", name, args, opts);

    const parent = this;

    const fn = createFunction();
    const rule = createRule();
    const target = createTarget();
    createPermission();

    this.fn = fn;
    this.rule = rule;
    this.target = target;

    function createFunction() {
      return output(args.job).apply((job) =>
        Function.fromDefinition(parent, `${name}Handler`, job),
      );
    }

    function createRule() {
      return new aws.cloudwatch.EventRule(
        `${name}Rule`,
        transform(args.transform?.rule, {
          scheduleExpression: args.schedule,
        }),
        { parent },
      );
    }

    function createTarget() {
      return new aws.cloudwatch.EventTarget(
        `${name}Target`,
        transform(args.transform?.target, {
          arn: fn.nodes.function.arn,
          rule: rule.name,
        }),
        { parent },
      );
    }

    function createPermission() {
      return new aws.lambda.Permission(
        `${name}Permission`,
        {
          action: "lambda:InvokeFunction",
          function: fn.nodes.function.arn,
          principal: "events.amazonaws.com",
          sourceArn: rule.arn,
        },
        { parent },
      );
    }
  }

  /**
   * The underlying [resources](/docs/components/#nodes) this component creates.
   */
  public get nodes() {
    return {
      /**
       * The sst.aws.Function.
       */
      job: this.fn,
      /**
       * The EventBridge Rule resource.
       */
      rule: this.rule,
      /**
       * The EventBridge Target resource.
       */
      target: this.target,
    };
  }
}
