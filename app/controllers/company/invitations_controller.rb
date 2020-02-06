# frozen_string_literal: true

class Company::InvitationsController < Devise::InvitationsController
  layout 'login'

  def after_accept_path_for(_consultant)
    dashboard_path
  end

  def edit
    # resource.build_consultant_profile
    # @document = resource.build_document

    resource.build_address
    super
  end

  def update
    if params[:user][:password] == params[:user][:password_confirmation]
      resource = resource_class.find_by_invitation_token(update_resource_params[:invitation_token], true)
      if resource.present?
        resource = resource_class.accept_invitation!(update_resource_params)
        if resource&.valid?
          sign_in(resource)
          # resource.send_confirmation_to_company_about_onboarding! if resource.invited_by.present?
          flash[:notice] = 'You have successfully completed your on-boarding.'
          redirect_to resource.class.name == 'Candidate' ? '/candidate' : dashboard_path
        else
          resource.invitation_token = update_resource_params[:invitation_token]
          flash[:errors] = resource.errors.full_messages
          redirect_back fallback_location: root_path
        end
      else
        resource.invitation_token = update_resource_params[:invitation_token] if resource
        flash[:errors] = resource.present? ? resource.errors.full_messages : ['Something is not right, Please try again.']
        redirect_back fallback_location: root_path
      end
    else
      flash[:notice] = 'Password Does not match'
      redirect_to accept_user_invitation_path(invitation_token: update_resource_params[:invitation_token])
  end
  end

  private

  def update_resource_params
    params.permit(user: [:invitation_token, :signature, :ssn, :dob, :email, :photo, :gender, :first_name, :last_name, :phone, :password, :password_confirmation,
                         address_attributes: %i[id address_1 address_2 city country state zip_code _destroy],
                         consultant_profile_attributes: %i[id location_id designation joining_date employment_type salary_type salary _destroy],
                         custom_fields_attributes: %i[id name value _destroy],
                         attachable_docs_attributes: %i[id file _destroy]])[:user]
  end
end
