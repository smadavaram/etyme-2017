jQuery ->
  new CompanyStatus

class CompanyStatus
  constructor: ->
    $("[name='company-status-toggle']").bootstrapSwitch()
    $('input[name="company-status-toggle"]').on('switchChange.bootstrapSwitch', @updateAttorneyStatus)

  updateAttorneyStatus: (event) ->
    status_link = $(".status-change")
    $.get "/company/users/status_update.json", (data) ->
      status_link.text(data.chat_status)
    event.preventDefault()