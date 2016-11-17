class Company::UsersController < Company::BaseController

  respond_to :js, :json, :html
  # Dashboard after Employer/Vendor login
  # add_breadcrumb :root_name, "/"

  def dashboard
    add_breadcrumb "HOME", :dashboard_path
  end # End of dashboard

  def update_photo
    @user = User.find(params[:id])
    if @user.update_attribute(:photo, params[:photo])
      render json: true
    else
      render json: false
    end
  end


  private
  def user_params
    params.require(:user).permit(:photo)
  end

end