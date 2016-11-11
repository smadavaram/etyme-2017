class Company::InvitationsController < Devise::InvitationsController

  layout 'login'

  def after_accept_path_for(employee)
    dashboard_path
  end

  def edit
    # resource.build_employee_profile
    super

  end

  def update

  end

  private

  def resource_prams
    params.permit(employee: [:invitation_token,:password, :password_confirmation, :photo, :first_name, :last_name, :secondary_email,:primary_phone, :secondary_phone, :dob, :gender, :identifier,
                             :signature, :emergency_contact_first_name,:emergency_contact_last_name, :emergency_contact_email, :emergency_contact_phone,
                             custom_fields_attributes: [:id,:field_name,:field_value,:is_required],
                             employee_docs_attributes:[:id,:file,:_destroy],
                             family_members_attributes: [:id,:first_name,:last_name,:cell_number,:relation,:_destroy,:email, :dob],
                             preferences: [:collect_tax_info, :collect_payroll_info,:collect_address_info,:collect_emergency_contact_info],
                             verification_documents_attributes: [:id, :name, :description, :_destroy, :employee_id, :uploaded_document],
                             account_attributes:[:id, :account_number, :bank_name, :branch_address, :branch_code, :is_primary, :status,:ein,:routing_number,:account_type, :_destroy],
                             address_attributes:[:id, :address_1, :address_2, :city, :country, :state, :status, :zip, :_destroy]])[:employee]
  end
end