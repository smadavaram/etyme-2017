# frozen_string_literal: true

module Company::LocationsHelper
  BLANK_PLACEHOLDER = '--'

  # Country/state codes are stored inconsistently across the app (some forms
  # save the code, others the full name), and old rows may hold codes that the
  # city-state data no longer knows about. Always fall back to the stored value
  # instead of blowing up the page.
  def location_country_name(address)
    code = address&.country
    return BLANK_PLACEHOLDER if code.blank?

    countries = safe_cs_lookup { CS.countries }
    return code unless countries.is_a?(Hash)

    countries[code.to_s.upcase.to_sym] || code
  end

  def location_state_name(address)
    code = address&.state
    return BLANK_PLACEHOLDER if code.blank?

    country = address&.country
    return code if country.blank?

    states = safe_cs_lookup { CS.states(country.to_s.upcase.to_sym) }
    return code unless states.is_a?(Hash)

    states[code.to_s.upcase.to_sym] || code
  end

  def location_city_name(address)
    city = address&.city
    return BLANK_PLACEHOLDER if city.blank?

    city.to_s.tr('_', ' ').split.map(&:capitalize).join(' ')
  end

  def location_zip_code(address)
    address&.zip_code.presence || BLANK_PLACEHOLDER
  end

  def location_street_address(address)
    street = [address&.address_1, address&.address_2].map(&:presence).compact.join(', ')
    street.presence || BLANK_PLACEHOLDER
  end

  # Option lists for the location form. Guard every city-state lookup: a brand
  # new location has no country/state yet, and legacy rows can hold codes the
  # data no longer recognises.
  def location_state_options(address)
    country = address&.country
    return [] if country.blank?

    states = safe_cs_lookup { CS.states(country.to_s.upcase.to_sym) }
    return [] unless states.is_a?(Hash)

    states.sort_by { |_code, name| name.to_s }.map { |code, name| [name, code] }
  end

  def location_city_options(address)
    country = address&.country
    state = address&.state
    return [] if country.blank? || state.blank?

    cities = safe_cs_lookup { CS.cities(state.to_s.upcase.to_sym, country.to_s.upcase.to_sym) }
    return [] unless cities.is_a?(Array)

    cities.compact.sort.map { |name| [name, name] }
  end

  private

  def safe_cs_lookup
    yield
  rescue StandardError
    nil
  end
end
