class Company::AddressesController < Company::BaseController
  respond_to :html,:json

  before_action :find_address,only: [:update]

  def update
    @address.update_attributes(address_params)
    respond_with @address
  end

  private
  def find_address
    locations=current_company.locations
    location=locations.find_by_address_id(params[:id])
    @address=location.address
  end

  def address_params
    params.require(:address).permit(:address_1,:country,:city,:state,:zip_code);
  end
end
