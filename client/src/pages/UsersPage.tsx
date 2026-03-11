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
    email: string;
    name: string;
  } | null;
  isSuperAdmin: boolean;
};

const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "office", "field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "mapping"]),
  language: z.enum(["en", "es"]).default("en"),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

const editUserSchema = z.object({
  role: z.enum(["admin", "office", "field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "mapping"]),
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
        title: "User created",
        description: "User has been successfully created and added to the company",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create user",
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
        title: "User updated",
        description: "User details have been successfully updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user",
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
        title: "User removed",
        description: "User has been successfully removed from the company",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (user: CompanyUserWithDetails) => {
    setSelectedUser(user);
    editUserForm.reset({
      role: user.companyUser.role as "admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping",
      status: user.companyUser.status as "active" | "invited" | "suspended",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (user: CompanyUserWithDetails) => {
    if (confirm(`Are you sure you want to remove ${user.user?.name || user.user?.email} from the company?`)) {
      deleteUserMutation.mutate(user.companyUser.id);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  const canManageUsers = currentUser?.activeRole === "admin" || currentUser?.isSuperAdminBool;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Team</h1>
          <p className="text-muted-foreground">Manage users in your company</p>
        </div>
        {canManageUsers && (
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-user">
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Create a new user account and add them to your company
                </DialogDescription>
              </DialogHeader>
              <Form {...createUserForm}>
                <form onSubmit={createUserForm.handleSubmit((data) => createUserMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={createUserForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-email" type="email" placeholder="user@example.com" />
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
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-name" placeholder="John Doe" />
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
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-password" type="password" placeholder="Min 8 characters" />
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
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="es">Español</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-submit-create-user">
                      {createUserMutation.isPending ? "Creating..." : "Create User"}
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
              <CardTitle className="text-lg">{userItem.user?.name || "Unknown User"}</CardTitle>
              <CardDescription>{userItem.user?.email}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Role:</span>
                  <RoleBadge 
                    role={userItem.companyUser.role as "admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping"} 
                    isSuperAdmin={userItem.isSuperAdmin}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {userItem.companyUser.status}
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
          <p className="text-muted-foreground">No users in this company yet</p>
        </div>
      )}

      {selectedUser && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update role and status for {selectedUser.user?.name || selectedUser.user?.email}
              </DialogDescription>
            </DialogHeader>
            <Form {...editUserForm}>
              <form onSubmit={editUserForm.handleSubmit((data) => updateUserMutation.mutate({ id: selectedUser.companyUser.id, updates: data }))} className="space-y-4">
                {selectedUser.isSuperAdmin ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Role</span>
                      <RoleBadge role="admin" isSuperAdmin={true} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Super admins always have full admin access across all companies. Role cannot be changed.
                    </p>
                  </div>
                ) : (
                  <FormField
                    control={editUserForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-role">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="office">Office</SelectItem>
                            <SelectItem value="field_manager">Field Manager</SelectItem>
                            <SelectItem value="chemical_manager">Chemical Manager</SelectItem>
                            <SelectItem value="field">Field</SelectItem>
                            <SelectItem value="irrigation_manager">Irrigation Manager</SelectItem>
                            <SelectItem value="shop_manager">Shop Manager</SelectItem>
                            <SelectItem value="mapping">Mapping</SelectItem>
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
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="invited">Invited</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
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
                      <FormLabel>Reset Password (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-password" type="password" placeholder="Leave empty to keep current password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={updateUserMutation.isPending} data-testid="button-submit-edit-user">
                    {updateUserMutation.isPending ? "Updating..." : "Update User"}
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
