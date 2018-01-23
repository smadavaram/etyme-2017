class Company::CompaniesController < Company::BaseController

  before_action :find_admin, only: :change_owner
  before_action :authorized_user , only: [:show,:create ,:hot_candidates,:index, :new]
  before_action :find_company , only: [:edit,:update,:destroy ,:add_reminder ,:assign_status ,:create_chat]
  before_action :set_hot_candidates ,only: [:hot_candidates]
  before_action :set_company_contacts , only:  [:contacts]
  before_action :find_user , only: [:create_chat]
  has_scope :search_by , only: :index
  respond_to :html,:json

  add_breadcrumb 'Companies', :companies_path, :title => ""

  def index
    if params[:status]=='all'
      respond_to do |format|
        format.js{
          @data = apply_scopes( Company.signup_companies..paginate(page: params[:page], per_page: 11))
        }
        format.html{
          @data = apply_scopes( Company.signup_companies.paginate(page: params[:page], per_page: 11))
        }
      end
    else
      @search = current_company.invited_companies.includes(:invited_company).search(params[:q])
      @invited_companies = @search.result.paginate(page: params[:page], per_page: 10)
      @new_company = Company.new
      @new_company.build_invited_by
    end

  end

  def edit
  end

  def hot_candidates

  end
  def hot_index
    add_breadcrumb 'Hot Companies'.humanize, :company_company_hot_index_path, :title => ""
    @candidates = CandidatesCompany.hot_candidate.where(company_id: current_company.id ).paginate(:page => params[:page], :per_page => 8)
  end

  def create
    @company = Company.new(create_params)
    respond_to do |format|
      if @company.valid? && @company.save
        format.html {flash[:success] = "successfully Created."}
        format.js{ flash.now[:success] = "successfully Created." }
      else
        format.js{ flash.now[:errors] =  @company.errors.full_messages }
        format.html{ flash[:errors] =  @company.errors.full_messages }
      end
    end
    redirect_to :back
  end

  def update
    respond_to do |format|
      format.json{current_company.update_attributes(company_params)
      flash[:success] = "Company Updated Successfully"
      respond_with current_company
      }
      format.html do
        if @company.update_attributes(create_params)
          if params[:company][:branches_attributes].present?
            params[:company][:branches_attributes].each_key do |mul_field|
              unless params[:company][:branches_attributes][mul_field].reject { |p| p == "id" }.present?
                Branch.where(id: params[:company][:branches_attributes][mul_field]["id"]).destroy_all
              end
            end
          end
          flash[:success] = "Company Updated Successfully"
        else
          flash[:errors] = @company.errors.full_messages
        end
        redirect_to :back
      end
    end

  end
  def contacts

  end

  def show
    @admin = current_company.admins.new
    @company = Company.find(params[:id] || params[:company_id])
    @company.billing_infos.build unless @company.billing_infos.present?
    @company.branches.build unless @company.branches.present?
    @company.addresses.build unless @company.addresses.present?
    add_breadcrumb current_company.name.titleize, company_path, :title => ""
    @company_doc = current_company.company_docs.new
    @company_doc.build_attachment
    @location = current_company.locations.build
    @location.build_address

    #pagination
    # @company_docs = current_company.company_docs.paginate(:page => params[:page], :per_page => 15)
  end
  def destroy
    if @company.destroy
      flash[:success] = "Company deleted successfully."
    else
      flash[:errors] = @company.errors.full_messages
    end
    redirect_to :back
  end
  def update_logo
    render json: current_company.update_attribute(:logo, params[:photo])
    flash.now[:success] = "Logo Successfully Updated"
  end

  def update_file
    current_company.update_attribute(:company_file, params[:file])
    flash.now[:success] = "File Successfully Updated"
    redirect_to :back
  end

  def update_video
    current_company.update_attribute(:video, params[:video])
    flash.now[:success] = "File Successfully Updated"
    redirect_to :back
  end

  def get_admins_list
    @users = Company.find_by_id(params[:id]).admins || []
    respond_to do |format|
        format.js
    end
  end

  def change_owner
    if current_company.update_column(:owner_id , @admin.id)
      flash[:success]="Owner Changed"
      respond_to do |format|
        format.js {render inline: "location.reload();" }
      end
    end
  end

  def assign_groups
    @invited_company = current_company.invited_companies.find_by(invited_company_id: params[:company_id])
    if request.post?
      groups = params[:invited_company][:group_ids]
      groups = groups.reject { |t| t.empty? }
      groups_id = groups.map(&:to_i)
      @invited_company.update_attribute(:group_ids, groups_id)
      if @invited_company.save
        flash[:success] = "Groups has been assigned"
      else
        flash[:errors] = @invited_company.errors.full_messages
      end
      redirect_to :back
    end
  end

  def authorized_user
    has_access?("manage_company")
  end

  def add_to_network
    @add_to_network = Candidate.signup.find_by(email: params[:email])
    @candidate = CandidatesCompany.new(company_id: current_company.id, candidate_id: @add_to_network.id)
    if @candidate.save
      flash[:success] = "Added To Your Company Network"
      respond_to do |format|
        format.js {render inline: "location.reload();" }
      end
    else
      flash[:notice] = @candidate.errors.full_messages
      respond_to do |format|
        format.js {render inline: "location.reload();" }
      end
    end
  end

  def add_reminder

  end
  def assign_status

  end
  def create_chat
    if request.post?
      @chat = @company.chats.find_by(chatable: current_company)
      if !@chat.present?
        @chat = current_company.chats.find_or_initialize_by(chatable: @company)
      end  
      if @chat.new_record?
        @chat.save
        @chat.chat_users.create(userable: current_user)
        @chat.chat_users.create(userable: @user)
      else
        @chat.chat_users.find_or_create_by(userable:current_user)
        @chat.chat_users.find_or_create_by(userable: @user)
      end
      redirect_to company_chat_path(@chat)
    end

  end


  private

  def find_user
    if request.post?
      @user = @company.users.find(params[:user_id])
    end
  end

  def set_company_contacts
    @company_contacts = current_company.invited_companies.find_by(invited_company_id: params[:company_id]).invited_company.company_contacts.paginate(:page => params[:page], :per_page => 20) || []
  end
  def set_hot_candidates
    @candidates = CandidatesCompany.hot_candidate.where(company_id: params[:company_id]).paginate(:page => params[:page], :per_page => 8)
  end
  def find_company
    @company = Company.find(params[:id] || params[:company_id])
  end

  def find_admin
    @admin = current_company.admins.find_by_id(params[:admin_id])
  end

    def company_params
      params.require(:company).permit(:name ,:company_type,:domain, :skill_list , :website,:logo,:description,:phone,:email,:linkedin_url,:facebook_url,:twitter_url,:google_url,:is_activated,:status,:time_zone,:tag_line,group_ids:[], owner_attributes:[:id, :type ,:first_name, :last_name ,:email,:password, :password_confirmation],locations_attributes:[:id,:name,:status,  address_attributes:[:id,:address_1,:country,:city,:state,:zip_code] ] )
    end

    def create_params
      params.require(:company).permit([:name  ,:domain,:currency_id,:phone ,:send_email ,group_ids:[],company_contacts_attributes:[:id, :type  , :first_name, :last_name ,:email,:company_id,:phone, :title ,:_destroy] , invited_by_attributes: [:invited_by_company_id , :user_id],
           custom_fields_attributes: [
          :id,
          :name,
          :value,
          :_destroy]],
         addresses_attributes:[:id,:address_1,:address_2,:country,:city,:state,:zip_code],
         billing_infos_attributes: [:id,:address,:country,:city,:zip],
         branches_attributes: [:id,:branch_name,:address,:country,:city,:zip],
         departments_attributes: [:id,:name]
        )
    end
end
