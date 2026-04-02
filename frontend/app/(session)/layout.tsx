import { DynamicIsland } from "../../components/DynamicIsland";

export default function SessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DynamicIsland />
      <div className="pt-32">
        {children}
      </div>
    </>
  );
}
