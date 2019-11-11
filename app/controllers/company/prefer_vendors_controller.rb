class Company::PreferVendorsController < Company::BaseController
  before_action :set_prefer_vendors_request, only: [:index]
  before_action :set_prefer_vendors, only: [:show_network]
  # add_breadcrumb "Prefer vendors", , options: { title: "Prefer vendors" }
  before_action :authorized_user, only: [:create, :show_network, :index, :accept, :reject]
  add_breadcrumb "Home", :dashboard_path, :title => "Home"
  has_scope :search_by, only: :marketplace

  def index
    add_breadcrumb "Prefer Vendors Requests".humanize, :prefer_vendors_path, :title => "Prefer Vendors"
  end
  
  def marketplace
    add_breadcrumb "Marketplace".humanize, '#', :title => "MarketPlace"
    get_cards
    if current_company&.vendor?
      @data = []
      respond_to do |format|
        format.html {
          if params[:Jobs] == 'on'
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id)))
          end
          unless  params[:title].blank?
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id),title: params[:job_titles]))
          end
          unless params[:job_departments].blank?
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id),department: params[:job_departments]))
          end
          unless params[:job_industry].blank?
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id),industry: params[:job_industry]))
          end
          unless params[:job_category].blank?
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id),job_category: params[:job_category]))
          end





          if params[:product] == 'on'
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id),listing_type: 'product'))
          end
          if params[:service] == 'on'
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id),listing_type: 'service'))
          end
          if params[:training] == 'on'
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id),listing_type: 'Training'))
          end
          if (params[:Candidates] == 'on')
            @data += apply_scopes(current_company.candidates)
          end
          if params[:company] == 'on'
            @data += apply_scopes(Company.where(id: current_company.prefer_vendors.pluck(:vendor_id)))


            # @data += apply_scopes(current_company.prefer_vendor_companies)
            # @data += apply_scopes(current_company.invited_companies_contacts)
            # @data += apply_scopes(current_company.candidates)
          end
          @data = @data.sort {|y, z| z.created_at <=> y.created_at}
        }
      end
    end
    @activities = PublicActivity::Activity.order("created_at desc")

  end


  # End of dashboard

  def filter_cards
    respond_to do |format|
      format.js {
        get_cards
      }
    end
  end

  def get_cards
    @cards = {}
    start_date = get_start_date
    end_date = get_end_date
    @cards["JOB"] = current_company.jobs.where(created_at: start_date...end_date).count
    @cards["BENCH JOB"] = current_company.jobs.where(status: 'Bench').where(created_at: start_date...end_date).count
    @cards["BENCH"] = current_company.candidates.where(company_id: current_company.id).where(created_at: start_date...end_date).count
    @cards["APPLICATION"] = current_company.received_job_applications.where(created_at: start_date...end_date).count
    @cards["STATUS"] = Company.status_count(current_company,start_date,end_date)
    @cards["ACTIVE"] = params[:filter]
  end

  def get_start_date
    case params[:filter] ? params[:filter] : 'year'
    when 'period'
      return DateTime.parse(params[:start_date]).beginning_of_day
    when 'month'
      return DateTime.current.beginning_of_month
    when 'quarter'
      return DateTime.current.beginning_of_quarter
    when 'year'
      return DateTime.current.beginning_of_year
    end
  end

  def get_end_date
    case params[:filter] ? params[:filter] : 'year'
    when 'period'
      return DateTime.parse(params[:end_date]).end_of_day
    when 'month'
      return DateTime.current.end_of_month
    when 'quarter'
      return DateTime.current.end_of_quarter
    when 'year'
      return DateTime.current.end_of_year
    end
  end

  
  def accept
    @prefer_vendor = current_company.perfer_vendor_companies.find_by(company_id: params[:company_id])
    if @prefer_vendor.pending?
      @prefer_vendor.accepted!
      @prefer_vendor.create_activity :update, owner: @prefer_vendor.prefer_vendor, recipient: @prefer_vendor.company
      flash[:success] = "Successfully Accepted "
      respond_to do |format|
        format.js { render inline: "location.reload();" }
      end
    else
      flash[:error] = @prefer_vendor.errors.full_messages
      respond_to do |format|
        format.js { render inline: "location.reload();" }
      end
    end
  end
  
  def vendor_activity
    add_breadcrumb "Vendor Activities", vendor_activity_prefer_vendors_path, :title => "Vendor Companies Activities"
    @activities = PublicActivity::Activity.where(owner_type: 'Company',
                                                 owner_id: current_company.prefer_vendors.accepted.pluck(:vendor_id))
                      .or(PublicActivity::Activity.where(owner_type: 'User',
                                                         owner_id: User.where(company_id: current_company.prefer_vendors.accepted.pluck(:vendor_id))))
                      .paginate(page: params[:page], per_page: 15)
  end
  
  def show_network
    add_breadcrumb "Prefer Vendors".humanize, :network_path, :title => "Prefer Vendors"
  end
  
  def reject
    @prefer_vendor = current_company.perfer_vendor_companies.find_by(company_id: params[:company_id])
    if @prefer_vendor.pending?
      @prefer_vendor.rejected!
      @prefer_vendor.create_activity :update, owner: @prefer_vendor.prefer_vendor, recipient: @prefer_vendor.company
      flash[:success] = "Successfully Rejected "
      respond_to do |format|
        format.js { render inline: "location.reload();" }
      end
    else
      flash[:error] = @prefer_vendor.errors.full_messages
      respond_to do |format|
        format.js { render inline: "location.reload();" }
      end
    end
  end
  
  def create
    vendor = current_company.prefer_vendors.create(vendor_id: params[:id], status: :pending)
    vendor.create_activity :create, owner: vendor.company, recipient: vendor.prefer_vendor
    flash[:success] = 'Vendor Request Successfully Sent.'
    respond_to do |format|
      format.html {}
      format.js { render inline: "location.reload();" }
    end
  end
  
  
  def authorized_user
    has_access?("manage_vendors")
  end
  
  
  private
  
  #
  def set_prefer_vendors
    @network = current_company.prefer_vendors.accepted
  end
  
  def set_prefer_vendors_request
    @sent_vendors = current_company.prefer_vendors.search(params[:q]) || []
    @vendors = @sent_vendors.result.paginate(page: params[:page], per_page: 30) || []
    @recived_vendors_search = current_company.perfer_vendor_companies.search(params[:q]) || []
    @recived_vendors = @recived_vendors_search.result.paginate(page: params[:page], per_page: 30) || []
  end
  
  def vendor_params
    params.require(:prefer_vendor).permit(:company_ids[])
  end


end
