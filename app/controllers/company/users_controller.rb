class Company::UsersController < Company::BaseController

  respond_to :js, :json, :html
  add_breadcrumb "HOME", :dashboard_path
  before_action :find_user  , only: [:add_reminder, :profile]

  has_scope :search_by , only: :dashboard

  def dashboard

    if current_company.vendor?
      @data = []
      respond_to do |format|
        format.js{
          if params[:value] == 'Jobs'
            @data += apply_scopes(Job.where( company_id: current_company.prefer_vendor_companies.map(&:id) ) )
          elsif(params[:value] == 'Candidates')
            @data += apply_scopes(current_company.candidates)
          elsif params[:value]== 'Contacts'
            @data += apply_scopes(current_company.invited_companies_contacts)
          else
            @data += apply_scopes(Job.where( company_id: current_company.prefer_vendor_companies.map(&:id) ) )
            @data += apply_scopes(current_company.invited_companies_contacts)
            @data += apply_scopes(current_company.candidates)
          end
          @data = @data.sort{|y,z| z.created_at <=> y.created_at}

        }
        format.html{
          @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id)))
          @data += apply_scopes(current_company.invited_companies_contacts)
          @data += apply_scopes(current_company.candidates)
          @data = @data.sort{|y,z| z.created_at <=> y.created_at}
        }
      end
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

  def update_video
    current_user.update_attributes(video: params[:video], video_type: params[:video_type])
    flash.now[:success] = "File Successfully Updated"
    redirect_back fallback_location: root_path
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
      redirect_back fallback_location: root_path
    end
  end
  def show
    @user = User.find(current_user.id)
    @user.address.build unless @user.address.present?
    add_breadcrumb current_user.try(:full_name), :company_user_path
  end

  def update
    if current_user.update_attributes!(user_params)
      if params[:user][:branches_attributes].present?
        params[:user][:branches_attributes].each_key do |mul_field|
          unless params[:user][:branches_attributes][mul_field].reject { |p| p == "id" }.present?
            Branch.where(id: params[:user][:branches_attributes][mul_field]["id"]).destroy_all
          end
        end
      end
      flash[:success] = "User Updated"
      redirect_back fallback_location: root_path
    else
      flash[:errors] = current_user.errors.full_messages
      redirect_back fallback_location: root_path
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
    params.require(:user).permit(:first_name, :last_name,:dob,:email,:age,:phone,:skills, :primary_address_id,:tag_list,group_ids: [],
     address_attributes: [:id,:address_1,:address_2,:country,:city,:state,:zip_code]

    )
  end

end