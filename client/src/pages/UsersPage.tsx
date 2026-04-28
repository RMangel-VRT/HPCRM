import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import RoleBadge from "@/components/RoleBadge";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

type CompanyUserWithDetails = {
  companyUser: {
    id: string;
    userId: string;
    companyId: string;
    role: string;
    status: string;
    createdAt: Date;
  };
  user: {
    id: string;
    email: string | null;
    phone?: string | null;
    name: string;
  } | null;
  isSuperAdmin: boolean;
};

const createUserSchema = z.object({
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["admin", "office", "field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor"]),
  language: z.enum(["en", "es"]).default("en"),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

const editUserSchema = z.object({
  role: z.enum(["admin", "office", "field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor"]),
  status: z.enum(["active", "invited", "suspended"]),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
});

type EditUserForm = z.infer<typeof editUserSchema>;

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<CompanyUserWithDetails | null>(null);

  const { data: users = [], isLoading } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
  });

  const createUserForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: "field",
      phone: "",
      email: "",
      name: "",
      password: "",
      language: "en",
    },
  });

  const editUserForm = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserForm) => {
      const res = await apiRequest("POST", "/api/companies/users/create", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies/users"] });
      setAddDialogOpen(false);
      createUserForm.reset();
      toast({
        title: t("users.userCreated"),
        description: t("users.userCreatedMsg"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("users.createFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: { id: string; updates: EditUserForm }) => {
      const res = await apiRequest("PATCH", `/api/company-users/${data.id}`, data.updates);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies/users"] });
      setEditDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: t("users.userUpdated"),
        description: t("users.userUpdatedMsg"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("users.updateFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/company-users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies/users"] });
      toast({
        title: t("users.userRemoved"),
        description: t("users.userRemovedMsg"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("users.removeFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (user: CompanyUserWithDetails) => {
    setSelectedUser(user);
    editUserForm.reset({
      role: user.companyUser.role as "admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor",
      status: user.companyUser.status as "active" | "invited" | "suspended",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (user: CompanyUserWithDetails) => {
    if (confirm(t("users.removeConfirm", { name: user.user?.name || user.user?.phone || user.user?.email }))) {
      deleteUserMutation.mutate(user.companyUser.id);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">{t("common.loading")}</div>
        </div>
      </div>
    );
  }

  const canManageUsers = currentUser?.activeRole === "admin" || currentUser?.isSuperAdminBool;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t("users.title")}</h1>
          <p className="text-muted-foreground">{t("users.manage")}</p>
        </div>
        {canManageUsers && (
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-user">
                <Plus className="w-4 h-4 mr-2" />
                {t("users.addUser")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{t("users.createNewUser")}</DialogTitle>
                <DialogDescription>
                  {t("users.createDescription")}
                </DialogDescription>
              </DialogHeader>
              <Form {...createUserForm}>
                <form onSubmit={createUserForm.handleSubmit((data) => createUserMutation.mutate(data))} className="flex flex-col flex-1 min-h-0">
                  <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                  <FormField
                    control={createUserForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("users.phoneLabel")}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-phone" type="tel" placeholder={t("users.phonePlaceholder")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createUserForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("users.emailOptional")}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-email" type="email" placeholder={t("users.emailPlaceholder")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createUserForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("users.fullName")}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-name" placeholder={t("users.namePlaceholder")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createUserForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("users.passwordLabel")}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-password" type="password" placeholder={t("users.passwordPlaceholder")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createUserForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("users.role")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-role">
                              <SelectValue placeholder={t("users.selectRole")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                            <SelectItem value="office">{t("roles.office")}</SelectItem>
                            <SelectItem value="field_manager">{t("roles.field_manager")}</SelectItem>
                            <SelectItem value="chemical_manager">{t("roles.chemical_manager")}</SelectItem>
                            <SelectItem value="field">{t("roles.field")}</SelectItem>
                            <SelectItem value="irrigation_manager">{t("roles.irrigation_manager")}</SelectItem>
                            <SelectItem value="shop_manager">{t("roles.shop_manager")}</SelectItem>
                            <SelectItem value="mapping">{t("roles.mapping")}</SelectItem>
                            <SelectItem value="landscape_supervisor">Landscape Supervisor</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createUserForm.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("sidebar.language")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-language">
                              <SelectValue placeholder={t("sidebar.language")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="en">{t("users.english")}</SelectItem>
                            <SelectItem value="es">{t("users.spanish")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-submit-create-user">
                      {createUserMutation.isPending ? t("common.creating") : t("users.createUser")}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((userItem) => (
          <Card key={userItem.companyUser.id} data-testid={`card-user-${userItem.companyUser.id}`}>
            <CardHeader>
              <CardTitle className="text-lg">{userItem.user?.name || t("users.unknownUser")}</CardTitle>
              <CardDescription>{userItem.user?.phone || userItem.user?.email}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t("users.role")}:</span>
                  <RoleBadge 
                    role={userItem.companyUser.role as "admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor"} 
                    isSuperAdmin={userItem.isSuperAdmin}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t("common.status")}:</span>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {t(`statuses.${userItem.companyUser.status}`, userItem.companyUser.status)}
                  </Badge>
                </div>
              </div>
              {canManageUsers && (
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(userItem)}
                    data-testid={`button-edit-user-${userItem.companyUser.id}`}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(userItem)}
                    data-testid={`button-delete-user-${userItem.companyUser.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {users.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t("common.noResults")}</p>
        </div>
      )}

      {selectedUser && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{t("users.editUser")}</DialogTitle>
              <DialogDescription>
                {t("users.updateDescription", { name: selectedUser.user?.name || selectedUser.user?.email })}
              </DialogDescription>
            </DialogHeader>
            <Form {...editUserForm}>
              <form onSubmit={editUserForm.handleSubmit((data) => updateUserMutation.mutate({ id: selectedUser.companyUser.id, updates: data }))} className="flex flex-col flex-1 min-h-0">
                <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                {selectedUser.isSuperAdmin ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t("users.role")}</span>
                      <RoleBadge role="admin" isSuperAdmin={true} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("users.superAdminNote")}
                    </p>
                  </div>
                ) : (
                  <FormField
                    control={editUserForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("users.role")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-role">
                              <SelectValue placeholder={t("users.selectRole")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                            <SelectItem value="office">{t("roles.office")}</SelectItem>
                            <SelectItem value="field_manager">{t("roles.field_manager")}</SelectItem>
                            <SelectItem value="chemical_manager">{t("roles.chemical_manager")}</SelectItem>
                            <SelectItem value="field">{t("roles.field")}</SelectItem>
                            <SelectItem value="irrigation_manager">{t("roles.irrigation_manager")}</SelectItem>
                            <SelectItem value="shop_manager">{t("roles.shop_manager")}</SelectItem>
                            <SelectItem value="mapping">{t("roles.mapping")}</SelectItem>
                            <SelectItem value="landscape_supervisor">Landscape Supervisor</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={editUserForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.status")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-status">
                            <SelectValue placeholder={t("users.selectStatus")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">{t("statuses.active")}</SelectItem>
                          <SelectItem value="invited">{t("statuses.invited")}</SelectItem>
                          <SelectItem value="suspended">{t("statuses.suspended")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editUserForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("users.resetPassword")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-password" type="password" placeholder={t("users.resetPasswordHint")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={updateUserMutation.isPending} data-testid="button-submit-edit-user">
                    {updateUserMutation.isPending ? t("common.updating") : t("users.updateUser")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
