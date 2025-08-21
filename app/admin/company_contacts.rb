ActiveAdmin.register CompanyContact, as: 'Contacts' do

  index do
    id_column
    column :company
    column :first_name
    column :last_name
    column :email
    column :phone
    column :status
    column :created_at
    column :updated_at
    actions
  end

  # See permitted parameters documentation:
  # https://github.com/activeadmin/activeadmin/blob/master/docs/2-resource-customization.md#setting-up-strong-parameters
  #
  # Uncomment all parameters which should be permitted for assignment
  #
  # permit_params :company_id, :first_name, :last_name, :email, :phone, :status, :title, :photo, :department, :user_id, :user_company_id, :created_by_id
  #
  # or
  #
  # permit_params do
  #   permitted = [:company_id, :first_name, :last_name, :email, :phone, :status, :title, :photo, :department, :user_id, :user_company_id, :created_by_id]
  #   permitted << :other if params[:action] == 'create' && current_user.admin?
  #   permitted
  # end

end
