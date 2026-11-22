"use client";

import { useEffect, useRef, useState, type FocusEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { quizLimits } from "@/lib/config";
import type { QuestionKind } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/client";
import { fieldAnswer, fieldQuestionId, toSaveReply, type SaveReply } from "./helpers";
import { createSaveQueue, type SaveQueue, type SaveStatus } from "./save-queue";

const kinds: readonly string[] = ["mcq", "tf", "ident"];

type AnswerField = { questionId: string; kind: QuestionKind; value: string };

function answerField(target: EventTarget): AnswerField | null {
  if (!(target instanceof HTMLInputElement)) return null;
  const questionId = fieldQuestionId(target.name);
  const kind = target.dataset.kind;
  if (!questionId || !kind || !kinds.includes(kind)) return null;
  return { questionId, kind: kind as QuestionKind, value: target.value };
}

export type Autosave = {
  status: SaveStatus | null;
  saveChange: (event: FormEvent<HTMLFormElement>) => void;
  saveBlur: (event: FocusEvent<HTMLFormElement>) => void;
};

export function useAutosave(attemptId: string, onReply: (reply: SaveReply) => void): Autosave {
  const router = useRouter();
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const queue = useRef<SaveQueue | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const created = createSaveQueue({
      send: async (questionId, answer) => {
        const { data, error } = await supabase.rpc("save_answer", {
          target_attempt: attemptId,
          target_question: questionId,
          answer,
        });
        if (error) return "failed";
        const reply = toSaveReply(data);
        onReply(reply);
        return reply.outcome;
      },
      onStatus: setStatus,
      onClosed: () => router.refresh(),
    });
    queue.current = created;
    return () => {
      created.stop();
      queue.current = null;
    };
  }, [attemptId, onReply, router]);

  return {
    status,
    saveChange(event) {
      const field = answerField(event.target);
      if (!field) return;
      const wait = field.kind === "ident" ? quizLimits.saveDebounceMilliseconds : 0;
      queue.current?.push(field.questionId, fieldAnswer(field.kind, field.value), wait);
    },
    saveBlur(event) {
      const field = answerField(event.target);
      if (field?.kind === "ident") queue.current?.flush(field.questionId);
    },
  };
}
