class Candidate::InvitationsController < Devise::InvitationsController

  layout 'login'

  def after_accept_path_for(consultant)
    dashboard_path
  end

  def edit
    # resource.build_consultant_profile
    # @document = resource.build_document
    # resource.build_address
    super
  end

  def update
    self.resource = resource_class.find_by_invitation_token(update_resource_params[:invitation_token],true)
    if resource.present? && update_resource_params[:password].present?
      resource = resource_class.accept_invitation!(update_resource_params)
      sign_in(resource)
      flash[:notice] = "You have Successfully Sign Up"
      redirect_to candidate_candidate_dashboard_path
    else
      flash[:error] = "Something went wrong please check it "
      redirect_back fallback_location: root_path
    end
  end

  private

  def update_resource_params
    params.permit(candidate: [:invitation_token , :dob ,:email,:photo,:gender,:first_name,:last_name,:phone,:password,:password_confirmation
                        ])[:candidate]
  end
end