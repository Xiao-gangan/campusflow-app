import { useEffect, useState, type ReactElement } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_ORGANIZATION_PROFILE,
  saveOrganizationProfile,
  useOrganizationProfile,
} from "./organization";

export function OrganizationSettingsDialog({
  children,
}: {
  children: ReactElement;
}) {
  const profile = useOrganizationProfile();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile.name);
  const [subtitle, setSubtitle] = useState(profile.subtitle);
  const [defaultDepartment, setDefaultDepartment] = useState(
    profile.defaultDepartment,
  );

  useEffect(() => {
    if (!open) return;
    setName(profile.name);
    setSubtitle(profile.subtitle);
    setDefaultDepartment(profile.defaultDepartment);
  }, [open, profile]);

  function handleSave() {
    saveOrganizationProfile({
      name: name.trim() || DEFAULT_ORGANIZATION_PROFILE.name,
      subtitle: subtitle.trim(),
      defaultDepartment:
        defaultDepartment.trim() || DEFAULT_ORGANIZATION_PROFILE.defaultDepartment,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            组织信息
          </DialogTitle>
          <DialogDescription>
            设置你的社团或学院组织名称，将自动同步到工作台与邮件/邀请函预览变量中。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="org-name" className="text-xs">
              组织名称
            </Label>
            <Input
              id="org-name"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：深圳大学土木与交通工程学院校友会"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org-subtitle" className="text-xs">
              英文名或副标题（可选）
            </Label>
            <Input
              id="org-subtitle"
              value={subtitle}
              maxLength={80}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="例如：SZU ALUMNI ASSOCIATION"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org-dept" className="text-xs">
              默认招新部门（用于模板预览）
            </Label>
            <Input
              id="org-dept"
              value={defaultDepartment}
              maxLength={40}
              onChange={(event) => setDefaultDepartment(event.target.value)}
              placeholder="例如：技术部 / 宣传部 / 外联部"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSave}>
            保存组织信息
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
