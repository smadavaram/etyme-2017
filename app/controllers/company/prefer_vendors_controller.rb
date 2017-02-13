class Company::PreferVendorsController < Company::BaseController
  before_action :set_prefer_vendors_request ,only: [:index]
  before_action :set_prefer_vendors ,only: [:show_network]
  # add_breadcrumb "Prefer vendors", , options: { title: "Prefer vendors" }
  def index
  end

  def accept
    @prefer_vendor =  current_company.perfer_vendor_companies.find_by(company_id: params[:company_id])
    if @prefer_vendor.pending?
      @prefer_vendor.accepted!
      flash[:success] = "Successfully Accepted "
      respond_to do |format|
        format.js {render inline: "location.reload();" }
      end
    else
      flash[:error] = @prefer_vendor.errors.full_messages
      respond_to do |format|
        format.js {render inline: "location.reload();" }
      end
    end
  end

  def show_network

  end

  def reject
    @prefer_vendor =  current_company.perfer_vendor_companies.find_by(company_id: params[:company_id])
    if @prefer_vendor.pending?
      @prefer_vendor.rejected!
      flash[:success] = "Successfully Rejected "
      respond_to do |format|
        format.js {render inline: "location.reload();" }
      end
    else
      flash[:error] = @prefer_vendor.errors.full_messages
      respond_to do |format|
        format.js {render inline: "location.reload();" }
      end
    end
  end

  def create
    companies = params[:prefer_vendor][:company_ids]
    companies = companies.reject { |t| t.empty? }
    companies_ids = companies.map(&:to_i)
    companies_ids.each do |c|
      current_company.prefer_vendors.create(vendor_id: c,status:0)
    end
    redirect_to :back
  end

  private
  #
  def set_prefer_vendors
    @network = current_company.send_or_received_network
  end

  def set_prefer_vendors_request
    @sent_vendors = current_company.prefer_vendors.search(params[:q]) || []
    @vendors = @sent_vendors.result.paginate(page: params[:page], per_page: 30) || []
    @recived_vendors_search = current_company.perfer_vendor_companies.search(params[:q]) || []
    @recived_vendors =  @recived_vendors_search.result.paginate(page: params[:page], per_page: 30) || []
  end

  def vendor_params
    params.require(:prefer_vendor).permit(:company_ids[] )
  end


end
