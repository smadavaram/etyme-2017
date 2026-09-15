# frozen_string_literal: true

class Company::PreferVendorsController < Company::BaseController
  before_action :set_prefer_vendors_request, only: [:index]
  before_action :set_prefer_vendors, only: [:show_network]
  # add_breadcrumb "Prefer vendors", , options: { title: "Prefer vendors" }
  before_action :authorized_user, only: %i[create show_network index accept reject]
  add_breadcrumb 'Dashboard', :dashboard_path
  has_scope :search_by, only: :marketplace
  # has_scope :search_by, using: %i[term _search_scop], type: :hash
  has_scope :search_by, using: %i[term], type: :hash

  def index
    add_breadcrumb 'NetWork Request'.humanize, prefer_vendors_path
  end

  def marketplace
    add_breadcrumb 'Marketplace'
    @skills = ActsAsTaggableOn::Tag.all.pluck('name')
    @search_scop_on = params[:search_by][:search_scop].eql?('on')

    service = VendorMarketplaceService.new(current_user, current_company)
    @data = service.search(params, method(:apply_scopes))

    respond_to do |format|
      format.html {}
    end
  end

  # End of dashboard

  def filter_cards
    respond_to do |format|
      format.js do
        get_cards
      end
    end
  end

  def get_cards
    service = DashboardService.new(current_user, current_company)
    @cards = service.marketplace_cards(params)
  end

  def get_start_date
    DashboardService.new(current_user, current_company).get_start_date(params)
  end

  def get_end_date
    DashboardService.new(current_user, current_company).get_end_date(params)
  end

  def accept
    @prefer_vendor = current_company.perfer_vendor_companies.find_by(company_id: params[:company_id])
    if @prefer_vendor.pending?
      @prefer_vendor.accepted!
      @prefer_vendor.create_activity :update, owner: @prefer_vendor.prefer_vendor, recipient: @prefer_vendor.company
      flash[:success] = 'Successfully Accepted '
      respond_to do |format|
        format.js { render inline: 'location.reload();' }
      end
    else
      flash[:error] = @prefer_vendor.errors.full_messages
      respond_to do |format|
        format.js { render inline: 'location.reload();' }
      end
    end
  end

  def vendor_activity
    add_breadcrumb 'Vendor Activitie(s)', vendor_activity_prefer_vendors_path, title: 'Vendor Companies Activities'
    @activities = PublicActivity::Activity.where(owner_type: 'Company',
                                                 owner_id: current_company.prefer_vendors.accepted.pluck(:vendor_id))
                                          .or(PublicActivity::Activity.where(owner_type: 'User',
                                                                             owner_id: User.where(company_id: current_company.prefer_vendors.accepted.pluck(:vendor_id))))
                                          .paginate(page: params[:page], per_page: 15)
  end

  def show_network
    add_breadcrumb 'Clients(s)-Vendors(s)'.humanize, network_path, title: 'Prefer Vendors'
  end

  def reject
    @prefer_vendor = current_company.perfer_vendor_companies.find_by(company_id: params[:company_id])
    if @prefer_vendor.pending?
      @prefer_vendor.rejected!
      @prefer_vendor.create_activity :update, owner: @prefer_vendor.prefer_vendor, recipient: @prefer_vendor.company
      flash[:success] = 'Successfully Rejected '
      respond_to do |format|
        format.js { render inline: 'location.reload();' }
      end
    else
      flash[:error] = @prefer_vendor.errors.full_messages
      respond_to do |format|
        format.js { render inline: 'location.reload();' }
      end
    end
  end

  def create
    vendor = current_company.prefer_vendors.create(vendor_id: params[:id], status: :pending)
    vendor.create_activity :create, owner: vendor.company, recipient: vendor.prefer_vendor
    flash[:success] = 'Vendor Request Successfully Sent.'
    respond_to do |format|
      format.html {}
      format.js { render inline: 'location.reload();' }
    end
  end

  def authorized_user
    has_access?('manage_vendors')
  end

  private

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
