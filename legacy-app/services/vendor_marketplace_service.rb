# frozen_string_literal: true

class VendorMarketplaceService
  def initialize(current_user, company)
    @current_user = current_user
    @company = company
  end

  def search(params, scope_applier)
    data = []
    search_scop_on = params.dig(:search_by, :search_scop).eql?('on')

    query_hash = {
      title: params[:Job_titles],
      department: params[:job_departments],
      industry: params[:job_industry],
      job_category: params[:job_category]
    }.delete_if { |_key, value| value.blank? }

    listing_type_array = [params[:product], params[:service], params[:training]].reject(&:blank?)
    if ['Product', 'Service', 'Training'].include?(params[:market_place_field_radio])
      listing_type_array << params[:market_place_field_radio]
    end

    if params[:Jobs] == 'on' || params[:market_place_field_radio] == 'Jobs'
      data += Job.joins(:tags).where("name like '#{params[:skills]}'")
      company_ids = search_scop_on ? @company.prefer_vendor_companies.pluck('id') : Company.ids
      base = scope_applier.call(Job.where({ company_id: company_ids }.merge(query_hash)))
      data += params[:address].blank? ? base : base.near(params[:address])
    elsif listing_type_array.any?
      company_ids = search_scop_on ? @company.prefer_vendor_companies.pluck('id') : Company.ids
      base = scope_applier.call(Job.where(listing_type: listing_type_array).where({ company_id: company_ids }.merge(query_hash)))
      data += params[:address].blank? ? base : base.near(params[:address])
    end

    if params[:Candidates] == 'on' || params[:market_place_field_radio] == 'Candidates'
      vendor_ids = @company.prefer_vendors.accepted.pluck(:vendor_id)
      base = scope_applier.call(search_scop_on ? @company.candidates_companies.hot_candidate.uniq(&:candidate_id).joins(:candidate).where(company_id: Company.where(id: vendor_ids)).select('candidates.*') : Candidate.where.not(confirmed_at: nil))
      data += params[:address].blank? ? base : base.near(params[:address])
    end

    if params[:company] == 'on' || params[:market_place_field_radio] == 'company'
      vendor_ids = @company.prefer_vendors.accepted.pluck(:vendor_id)
      if params[:address].blank?
        data += scope_applier.call(search_scop_on ? Company.where(id: vendor_ids) : Company.all)
      else
        data += scope_applier.call(search_scop_on ? Address.near(params[:address]).joins(locations: :company).where(companies: { id: vendor_ids }).select('companies.*') : Address.near(params[:address]).joins(locations: :company).select('companies.*'))
      end
    end

    data.sort { |y, z| z.created_at <=> y.created_at }
  end
end
