import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoadError({
  message,
  hint = "Chạy supabase_schema.sql trong SQL Editor của Supabase, rồi tải lại trang.",
}: {
  message: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Không đọc được dữ liệu</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      </CardContent>
    </Card>
  );
}
