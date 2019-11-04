class Company::PreferVendorsController < Company::BaseController
  before_action :set_prefer_vendors_request, only: [:index]
  before_action :set_prefer_vendors, only: [:show_network]
  # add_breadcrumb "Prefer vendors", , options: { title: "Prefer vendors" }
  before_action :authorized_user, only: [:create, :show_network, :index, :accept, :reject]
  add_breadcrumb "Home", :dashboard_path, :title => "Home"
  
  def index
    add_breadcrumb "Prefer Vendors Requests".humanize, :prefer_vendors_path, :title => "Prefer Vendors"
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
