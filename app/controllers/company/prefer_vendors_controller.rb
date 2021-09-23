# frozen_string_literal: true

class Company::PreferVendorsController < Company::BaseController
  before_action :set_prefer_vendors_request, only: [:index]
  before_action :set_prefer_vendors, only: [:show_network]
  # add_breadcrumb "Prefer vendors", , options: { title: "Prefer vendors" }
  before_action :authorized_user, only: %i[create show_network index accept reject]
  add_breadcrumb 'Dashboard', :dashboard_path
  has_scope :search_by, only: :marketplace
  has_scope :search_by, using: %i[term], type: :hash

  def index
    add_breadcrumb 'NetWork Request'.humanize, prefer_vendors_path
  end

  def marketplace
    
    binding.pry
    
    add_breadcrumb 'Marketplace'
    @skills = ActsAsTaggableOn::Tag.all.pluck('name')
    @data = []
    @search_scop_on = params[:search_by][:search_scop].eql?('on')
    @query_hash = {
      title: params[:Job_titles],
      department: params[:job_departments],
      industry: params[:job_industry],
      job_category: params[:job_category]
    }.delete_if { |_key, value| value.blank? }
    @listing_type_array = [params[:product], params[:service], params[:training]].reject(&:blank?)

    respond_to do |format|
      format.html do
        if params[:Jobs] == 'on'
          @data += Job.joins(:tags).where("name like '#{params[:skills]}'")
          @data += if params[:address].blank?

                     apply_scopes(Job.where(@search_scop_on ?
                                                         { company_id: current_company.prefer_vendor_companies.pluck('id') }.merge(@query_hash) :
                                                         { company_id: Company.ids }.merge(@query_hash)))
                   else
                     apply_scopes(Job.where(@search_scop_on ?
                                                         { company_id: current_company.prefer_vendor_companies.pluck('id') }.merge(@query_hash) :
                                                         { company_id: Company.ids }.merge(@query_hash)).near(params[:address]))

                   end
        elsif params[:product] == 'Product' || params[:service] == 'Service' || params[:training] == 'Training'
          @data += if params[:address].blank?
                     apply_scopes(Job.where(listing_type: @listing_type_array).where(@search_scop_on ?
                                                                                                  { company_id: current_company.prefer_vendor_companies.pluck('id') }.merge(@query_hash) :
                                                                                                  { company_id: Company.ids }.merge(@query_hash)))
                   else
                     apply_scopes(Job.where(@search_scop_on ?
                                                         { company_id: current_company.prefer_vendor_companies.pluck('id') }.merge(@query_hash) :
                                                         { company_id: Company.ids }.merge(@query_hash)).near(params[:address]))

                   end
        end

        if params[:Candidates] == 'on'
          if params[:address].blank?
             @data += apply_scopes(@search_scop_on ? current_company.candidates_companies.hot_candidate.joins(:candidate).where(company_id: Company.where(id: current_company.prefer_vendors.accepted.pluck(:vendor_id))).select('candidates.*') : Candidate.where.not(confirmed_at: nil))
           else
             @data += apply_scopes(@search_scop_on ? current_company.candidates_companies.hot_candidate.joins(:candidate).where(company_id: Company.where(id: current_company.prefer_vendors.accepted.pluck(:vendor_id))).select('candidates.*') : Candidate.where.not(confirmed_at: nil)).near(params['address'])
           end
        end

        if params[:company] == 'on'
          
          binding.pry
          
          if params[:address].blank?
             @data += apply_scopes(@search_scop_on ? Company.where(id: current_company.prefer_vendors.accepted.pluck(:vendor_id)) : Company.all)
           else
             # @data += apply_scopes(@search_scop_on ? Address.near('lahire').joins(locations: :company).where(companies: {id: current_company.prefer_vendors.accepted.pluck(:vendor_id)}))
             @data += apply_scopes(@search_scop_on ? Address.near(params['address']).joins(locations: :company).where(companies: { id: current_company.prefer_vendors.accepted.pluck(:vendor_id) }).select('companies.*') : Address.near(params['address']).joins(locations: :company).select('companies.*'))
           end
        end

        @data = @data.sort { |y, z| z.created_at <=> y.created_at }
      end
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
    @cards = {}
    start_date = get_start_date
    end_date = get_end_date
    @cards['JOB'] = current_company.jobs.where(created_at: start_date...end_date).count
    @cards['BENCH JOB'] = current_company.jobs.where(status: 'Bench').where(created_at: start_date...end_date).count
    @cards['BENCH'] = current_company.candidates.where(company_id: current_company.id).where(created_at: start_date...end_date).count
    @cards['APPLICATION'] = current_company.received_job_applications.where(created_at: start_date...end_date).count
    @cards['STATUS'] = Company.status_count(current_company, start_date, end_date)
    @cards['ACTIVE'] = params[:filter]
  end

  def get_start_date
    filter = params[:filter] || 'year'
    case filter
    when 'period'
      DateTime.parse(params[:start_date]).beginning_of_day
    when 'month'
      DateTime.current.beginning_of_month
    when 'quarter'
      DateTime.current.beginning_of_quarter
    when 'year'
      DateTime.current.beginning_of_year
    end
  end

  def get_end_date
    filter = params[:filter] || 'year'
    case filter
    when 'period'
      DateTime.parse(params[:end_date]).end_of_day
    when 'month'
      DateTime.current.end_of_month
    when 'quarter'
      DateTime.current.end_of_quarter
    when 'year'
      DateTime.current.end_of_year
    end
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
