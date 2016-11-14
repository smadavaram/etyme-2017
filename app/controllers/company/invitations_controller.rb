class Company::InvitationsController < Devise::InvitationsController

  layout 'login'

  def after_accept_path_for(employee)
    dashboard_path
  end

  def edit
    # resource.build_employee_profile
    resource.build_address
    super

  end

  def update
    self.resource = resource_class.find_by_invitation_token(update_resource_params[:invitation_token],true)
    if resource.present?
      resource = resource_class.accept_invitation!(update_resource_params)
      if resource && resource.valid?
        sign_in(resource)
        flash[:notice] = "You have successfully completed your on-boarding."
        redirect_to dashboard_path
      else
        resource.invitation_token = update_resource_params[:invitation_token]
        flash[:errors] = resource.errors.full_messages
        redirect_to :back
      end
    else
      resource.invitation_token = update_resource_params[:invitation_token] if resource
      flash[:errors] = resource.present? ? resource.errors.full_messages : ['Something is not right, Please try again.']
      redirect_to :back
    end

  end

  private

  def update_resource_params
    params.permit(user: [:invitation_token,
                             :email,
                             :photo ,
                             :first_name ,
                             :last_name ,
                             :phone,
                             :password,
                             :password_confirmation,
                             address_attributes:[
                                 :id,
                                 :address_1,
                                 :address_2,
                                 :city,
                                 :country,
                                 :state,
                                 :zip_code ,  :_destroy],
                             employee_profile_attributes:[:id, :location_id ,:designation, :joining_date ,:employment_type,:salary_type, :salary]
                              ])[:user]
  end
end