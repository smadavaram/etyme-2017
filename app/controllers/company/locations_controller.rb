class Company::LocationsController < Company::BaseController

  before_action :set_location , only: [:create]
  before_action :find_location,only:[:edit,:update]
  before_action :set_new_location , only: [:new]
  respond_to :html,:json

  def create
    @location=current_company.locations.create!(location_params)
    redirect_to :back
  end

  def new

  end

  def show

  end

  def edit

  end

  def update
    @location.update_attributes(location_params)
    redirect_to :back

  end

  private

  def set_new_location
    @location = current_company.locations.new
    @location.build_address
  end

  def find_location
    @location=current_company.locations.find(params[:id])
  end
  def set_location
    @location=current_company.locations.new(location_params)
  end

  def location_params
    params.require(:location).permit(:id,:name,:status,
                                     address_attributes:[:id,:address_1,:address_2,:country,:city,:state,:zip_code] )
  end
end
