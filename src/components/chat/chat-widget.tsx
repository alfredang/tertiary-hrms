"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import type { UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MessageCircle, X, Send, Bot, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const renderFormattedText = (text: string) => {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Bold: **text**
    const parts = line.split(/(\*\*.*?\*\*)/g).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    // Bullet lines
    if (line.match(/^[\s]*[-*•]\s/)) {
      const content = line.replace(/^[\s]*[-*•]\s/, "");
      const formatted = content.split(/(\*\*.*?\*\*)/g).map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={j}>{part.slice(2, -2)}</strong>;
        }
        return part;
      });
      return <div key={i} className="pl-3 py-0.5">• {formatted}</div>;
    }

    // Numbered lines
    if (line.match(/^\d+\.\s/)) {
      return <div key={i} className="pl-2 py-0.5">{parts}</div>;
    }

    // Empty lines as spacing
    if (line.trim() === "") {
      return <div key={i} className="h-1.5" />;
    }

    return <div key={i} className="py-0.5">{parts}</div>;
  });
};

export function ChatWidget({ isAdmin = false }: { isAdmin?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({ api: "/api/chat" }),
    onError: () => {
      toast({
        title: "Chat unavailable",
        description: "The AI assistant is not configured yet. Please try again later.",
        variant: "destructive",
      });
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    const text = inputValue;
    setInputValue("");
    await sendMessage({ text });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <>
      {/* Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed right-4 sm:right-6 z-50 bg-primary text-white p-3 sm:p-4 rounded-full shadow-lg hover:bg-primary/90 transition-all bottom-[4.5rem] lg:bottom-6"
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed right-3 sm:right-6 z-50 w-[calc(100vw-24px)] sm:w-96 shadow-2xl bottom-[4.5rem] lg:bottom-6" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <CardHeader className="bg-primary text-white rounded-t-xl flex flex-row items-center justify-between py-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <CardTitle className="text-base font-medium">HR Assistant</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            {/* Messages */}
            <div className="h-80 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-gray-500 py-4">
                  <Bot className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm text-center font-medium text-gray-400 mb-3">Hi! I&apos;m your HR Assistant.</p>
                  <p className="text-xs text-gray-500 mb-2">I can help you with:</p>
                  <ul className="text-xs text-gray-500 space-y-1 ml-1">
                    {isAdmin ? (
                      <>
                        <li>- Approving or rejecting leave &amp; expenses</li>
                        <li>- Adding employees &amp; resetting passwords</li>
                        <li>- Generating payroll &amp; uploading Excel</li>
                        <li>- Managing employee statuses</li>
                        <li>- Company settings &amp; leave rollover</li>
                        <li>- Using the admin/staff view toggle</li>
                      </>
                    ) : (
                      <>
                        <li>- How to apply for leave or submit expenses</li>
                        <li>- Leave balances and policies</li>
                        <li>- Viewing payslips &amp; CPF questions</li>
                        <li>- How to change your password</li>
                        <li>- Using the calendar</li>
                        <li>- Navigating the app</li>
                      </>
                    )}
                  </ul>
                  <p className="text-xs text-gray-400 mt-3">
                    Try: &quot;{isAdmin ? "How do I reset an employee's password?" : "How do I apply for leave?"}&quot;
                  </p>
                </div>
              )}

              {messages.map((message: UIMessage) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-2",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                      message.role === "user"
                        ? "bg-primary text-white rounded-tr-none"
                        : "bg-gray-100 text-gray-900 rounded-tl-none"
                    )}
                  >
                    {message.role === "assistant"
                      ? renderFormattedText(message.parts.find((p): p is { type: "text"; text: string } => p.type === "text")?.text ?? "")
                      : (message.parts.find((p): p is { type: "text"; text: string } => p.type === "text")?.text ?? "")}
                  </div>
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={handleSend}
              className="border-t p-4 flex gap-2"
            >
              <Input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="Ask a question..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={isLoading || !inputValue.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </>
  );
}
