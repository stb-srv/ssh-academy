import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { CodeBlock } from "@/components/lernen/code-block";
import { Hinweis } from "@/components/lernen/hinweis";
import { Os, OsTabs } from "@/components/lernen/os-tabs";
import { KeyDiagram, LoginFlowDiagram } from "@/components/lernen/diagrams";

const components: MDXComponents = {
  pre: (props) => <CodeBlock {...props} />,
  a: ({ href = "", ...props }) =>
    href.startsWith("/") ? <Link href={href} {...props} /> : <a href={href} target="_blank" rel="noreferrer" {...props} />,
  table: (props) => (
    <div className="my-6 overflow-x-auto">
      <table {...props} />
    </div>
  ),
  OsTabs,
  Os,
  Hinweis,
  KeyDiagram,
  LoginFlowDiagram,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
