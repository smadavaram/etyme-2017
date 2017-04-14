module StaticHelper
  def resource_name
    :candidate
  end

  def resource
    @resource ||= Candidate.new
  end

  def resource_class
    Candidate
  end
  def flash_class(level)
    case level
      when :notice then 'alert alert-info alert-dismissible'
      when :success then 'alert alert-success alert-dismissible'
      when :error then 'alert alert-error alert-dismissible'
      when :alert then 'alert alert-error alert-dismissible'
      when :errors then 'alert alert-error alert-dismissible'
    end
  end

  def flash_message(key,value)
    data = "<div role='alert' class= '#{flash_class(key.to_sym)}'><button type='button' class='close' data-dismiss='alert' aria-label='Close'>
    <span aria-hidden='true'>&times;</span>
  </button> #{value.is_a?(String) ? value : value.first} </div>"
    data.html_safe
  end

end
