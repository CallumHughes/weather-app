import { useForm } from "@tanstack/react-form";
import { Button } from "@weather-app/ui/components/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@weather-app/ui/components/field";
import { Input } from "@weather-app/ui/components/input";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "../loader";

export default function SignInForm({ onSuccess }: { onSuccess?: () => void }) {
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            toast.success("Sign in successful");
            onSuccess?.();
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="email">
          {(field) => {
            const invalid = field.state.meta.errors.length > 0;
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  placeholder="m@example.com"
                  aria-invalid={invalid || undefined}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="password">
          {(field) => {
            const invalid = field.state.meta.errors.length > 0;
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  aria-invalid={invalid || undefined}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>

        <Field>
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? "Submitting..." : "Sign in"}
              </Button>
            )}
          </form.Subscribe>
        </Field>
      </FieldGroup>
    </form>
  );
}
