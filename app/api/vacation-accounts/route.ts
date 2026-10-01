import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { isValidYear, type VacationAccountDto } from "@/app/admin/vacation-years-data";

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const canSeeOthers = hasPermission(context, "otherVacations");
  if (!canSeeOthers && !hasPermission(context, "ownVacation")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!isValidYear(year)) {
    return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });
  }

  const accounts = await prisma.vacationAccount.findMany({
    where: {
      year,
      ...(canSeeOthers ? {} : { employeeId: context.employeeId ?? "__none__" }),
    },
  });

  return NextResponse.json(
    accounts.map((account): VacationAccountDto => ({
      employeeId: account.employeeId,
      year: account.year,
      annualAllowance: account.annualAllowance,
      carryOverDays: account.carryOverDays,
    })),
  );
}
