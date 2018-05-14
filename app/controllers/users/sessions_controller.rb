class Users::SessionsController < Devise::SessionsController
# before_action :configure_sign_in_params, only: [:create]

  layout 'static'
  add_breadcrumb "Home",'/'
  add_breadcrumb "Company",""
  add_breadcrumb "Sign In",''
  # before_action :check_company_user ,only: [:create]

  # GET /resource/sign_in
  def new
    if request.subdomain.present?
     super
    else
      flash[:error] = "You can't sign in without your company Domain"
      redirect_to '/'
    end
   end

  # POST /resource/sign_in
   def create
     if check_company_user
      super
      cookies.permanent.signed[:userid] = resource.id if resource.present?
     else
       flash[:error] = "User is not registerd on this domain"
       redirect_back fallback_location: root_path
     end

   end

  # DELETE /resource/sign_out
   def destroy
     super
   end

  # protected

  # If you have extra params to permit, append them to the sanitizer.
  # def configure_sign_in_params
  #   devise_parameter_sanitizer.permit(:sign_in, keys: [:attribute])
  # end

  private

  def check_company_user
    if current_company.users.find_by(email: (params[:user][:email]).downcase).present?
      return true
    else
      if params[:user][:email].split("@")[1].start_with?(current_company.slug)
        current_company.users.create(
                                      email: params[:user][:email],
                                      company_id: current_company.id,
                                      password: "passpass#{rand(999)}",
                                      password_confirmation: "passpass#{rand(999)}"
                                    )
        u = User.where(email: params[:user][:email]).first
        flash[:error] = "Please check your email."
        u.send_reset_password_instructions()
        return true
      else
        return false
      end
    end
  end
end
