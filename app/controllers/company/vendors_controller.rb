class Company::VendorsController < Company::BaseController

  #CallBacks
  before_action :set_vendors ,only: :index
  before_action :find_vendor ,only: [:show]

  #BreadCrumbs
  add_breadcrumb "Vendors", :vendors_path


  def show
    add_breadcrumb @vendor.full_name.titleize,:vendor_path
  end

  def index
  end

  private
  def find_vendor
    @vendor=Vendor.find(params[:id]);
  end
  def set_vendors
    @vendors=Vendor.all
  end
end
