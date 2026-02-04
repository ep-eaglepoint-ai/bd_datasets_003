def calculate_override(manual_lock, auth_valid, emergency_pulse, fail_safe):
    # This mess needs to die
    if not manual_lock:
        if auth_valid:
            return True
        else:
            if emergency_pulse:
                if not fail_safe:
                    return True
                else:
                    return False
            else:
                return False
    else:
        if emergency_pulse:
            if auth_valid:
                return True
            else:
                if not fail_safe:
                    return True
                else:
                    return False
        else:
            return False
