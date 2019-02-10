module BullettrainHelper
  def markdown(string)
    @markdown ||= Redcarpet::Markdown.new(Redcarpet::Render::HTML, extensions = {})
    @markdown.render(string).html_safe
  end

  def current_team
    current_user.current_team
  end

  # e.g. October 11, 2018
  def display_date(timestamp)
    local_time(timestamp).strftime("%B %d, %Y")
  end

  # e.g. October 11, 2018 at 4:22 PM
  def display_date_and_time(timestamp)
    local_time(timestamp).strftime("%B %d, %Y at %l:%M %p")
  end

  def local_time(time)
    return time if current_user.time_zone.nil?
    time.in_time_zone(current_user.time_zone)
  end

  def image_width_for_height(filename, target_height)
    source_width, source_height = FastImage.size("#{Rails.root}/app/assets/images/#{filename}")
    ratio = source_width.to_f / source_height.to_f
    (target_height * ratio).to_i
  end

  def gravatar(user)
    return "https://www.gravatar.com/avatar/#{Digest::MD5.hexdigest(user.email)}?d=mm"
  end

  def demo
    ENV['DEMO'] ? " <small>Demo</small>".html_safe : ""
  end

  def first_btn_primary

    # the first time we hit this method, @first will be true.
    # the second time, it'll already be defined and should remain false.
    @first ||= 'first'

    if @first == 'first'
      @first = 'not-first'
      return 'btn-primary'
    else
      return 'btn-link'
    end

  end

  def possessive_string(string)
    return string.possessive if [:en].include? I18n.locale
    string
  end

  def show_category?(plan_category)
    if @subscription.try(:persisted?) && @subscription.try(:plan)
      @subscription.plan.try(:plan_category) == plan_category
    else
      plan_category.default
    end
  end

  def current_membership
    current_user.memberships.where(team: current_team).first
  end

end
