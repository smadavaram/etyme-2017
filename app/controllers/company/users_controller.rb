class Company::UsersController < Company::BaseController

  respond_to :js, :json, :html
  add_breadcrumb "HOME", :dashboard_path
  before_action :find_user  , only: [:add_reminder, :profile]

  def dashboard
    if !current_company.vendor?
      @data = []
      @data += current_company.jobs
      @data += current_company.invited_companies_contacts
      @data += current_company.candidates
      @data = @data.sort{|y,z| z.created_at <=> y.created_at}
    end
    @activities = PublicActivity::Activity.order("created_at desc")
  end # End of dashboard
  def profile
    add_breadcrumb @user.try(:full_name), "#"
  end
  def update_photo
    render json: current_user.update_attribute(:photo, params[:photo])
    flash.now[:success] = "Photo Successfully Updated"
  end
  def assign_groups
    @user = current_company.users.find(params[:user_id])
    if request.post?
      groups = params[:user][:group_ids]
      groups = groups.reject { |t| t.empty? }
      groups_id = groups.map(&:to_i)
      @user.update_attribute(:group_ids, groups_id)
      if @user.save
        flash[:success] = "Groups has been assigned"
      else
        flash[:errors] = @user.errors.full_messages
      end
      redirect_to :back
    end
  end
  def show
    add_breadcrumb current_user.try(:full_name), :company_user_path
  end

  def update
    if current_user.update_attributes!(user_params)
      flash[:success] = "User Updated"
      respond_with current_user
    else
      flash[:errors] = current_user.errors.full_messages
      redirect_to :back
    end
  end
  def add_reminder

  end

  def notify_notifications
    @notifications = current_user.notifications || []
    render layout: false
  end

  private
  def find_user
    @user = current_company.users.find(params[:user_id] || params[:user_id]) || []
  end
  def user_params
    params.require(:user).permit(:first_name, :last_name,:dob,:email,:phone,:skills, :primary_address_id,:tag_list,group_ids: [],
     address_attributes: [:id,:address1,:address2,:country,:city,:state,:zip_code]

    )
  end

end