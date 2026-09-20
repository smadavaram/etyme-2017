# frozen_string_literal: true

class Company::LocationsController < Company::BaseController
  before_action :find_location, only: %i[edit update destroy]
  before_action :ensure_address, only: [:edit]
  before_action :set_new_location, only: [:new]
  respond_to :html, :json
  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'Location(s)'
    @locations = current_company.locations.includes(:address).order(:name)
  end

  def create
    @location = current_company.locations.new(location_params)

    if @location.save
      flash[:notice] = "#{@location.name} has been added."
    else
      flash[:alert] = @location.errors.full_messages.to_sentence
    end
    redirect_back fallback_location: locations_path
  end

  def new; end

  def show; end

  def edit; end

  def update
    if @location.update(location_params)
      flash[:notice] = "#{@location.name} has been updated."
    else
      flash[:alert] = @location.errors.full_messages.to_sentence
    end
    redirect_back fallback_location: locations_path
  end

  def destroy
    name = @location.name
    @location.destroy
    flash[:notice] = "#{name.presence || 'Location'} has been removed."
    redirect_back fallback_location: locations_path
  end

  private

  def set_new_location
    @location = current_company.locations.new
    @location.build_address
  end

  def find_location
    @location = current_company.locations.find(params[:id])
  end

  # Older locations were saved without an address, which left the edit form
  # blank because the address fields live inside the nested address builder.
  def ensure_address
    @location.build_address if @location.address.blank?
  end

  def location_params
    params.require(:location).permit(:id, :name, :status,
                                     address_attributes: %i[id address_1 address_2 country city state zip_code])
  end
end
